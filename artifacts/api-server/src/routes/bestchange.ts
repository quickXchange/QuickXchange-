import { Router, type IRouter } from "express";
import { fiatCurrencyPaymentMethodsTable } from "@workspace/db";
import { getDestinationPaymentMethodReserve } from "../lib/payment-method-reserves";
import { onBestchangeConfigurationChange } from "../lib/bestchange-cache-invalidation";
import { and, eq } from "drizzle-orm";
import {
  GetAdminBestchangeResponse, UpdateAdminBestchangeBody, UpdateAdminBestchangeResponse,
  GetAdminBestchangePreviewResponse, PreviewAdminBestchangeReservesBody, ApplyAdminBestchangeReservesBody,
} from "@workspace/api-zod";
import { bestchangeSettingsTable, manualDeskPricingRulesTable, db } from "@workspace/db";
import {
  syncBestchangeDirections, isAutomaticBestchangeDirection,
} from "../lib/bestchange-direction-sync";
import reference from "../data/bestchange-reference.json";
import { requireOwner, getOperatorActorUserId, type OperatorAuthorization } from "../lib/operator-auth";
import {
  exportBestchangeReserves, previewBestchangeReserves, applyBestchangeReserves,
} from "../lib/bestchange-reserve-transfer";
import { ApiError } from "../lib/api-error";
import { listPublicFiatSettlementOptions } from "../lib/payment-methods";
import { listPublicManualCryptoSettlementOptions } from "../lib/manual-crypto";
import { prepareBestchangeSwapQuotes } from "./exchange";
import { hasActiveConvertOrderForXml } from "../lib/xml-convert-order-activity";
import {
  adjustXmlOutput, DEFAULT_XML_PERCENTAGE_ADJUSTMENT, selectedXmlPercentage,
} from "../lib/xml-percentage-adjustment";
import {
  BestchangeExportError, conservativePrice, pricingSamples, plainDecimal,
  smallerDecimal, serializeBestchangeXml, compareDecimal, type BestchangeItem,
} from "../lib/bestchange-xml";

const router: IRouter = Router();
type BestchangeSettings = Omit<ReturnType<typeof UpdateAdminBestchangeBody.parse>, "updatedAt"> & { updatedAt?: string | Date };
type BestchangeDirection = BestchangeSettings["directions"][number];
type BestchangePreview = Omit<ReturnType<typeof GetAdminBestchangePreviewResponse.parse>, "generatedAt"> & {
  generatedAt: string;
  // Internal cache metadata; public preview validation strips these fields.
  xmlAdjustmentEnabled?: boolean;
  activeConvertOrdersForAdjustment?: boolean;
};
const currencyCodes = new Set(reference.currencyCodes.map(row => row.code));
const cityCodes = new Set(reference.cityCodes.map(row => row.code));
const CACHE_MS = 1_000;
let generation = 0;
let pending: Promise<BestchangePreview> | undefined;
let cached: { expires: number; result: BestchangePreview } | undefined;
let refreshBlockedUntil = 0;
function invalidate() {
  generation++;
  pending = undefined;
  cached = undefined;
  refreshBlockedUntil = 0;
}
async function settings(): Promise<BestchangeSettings> {
  const [row] = await db.select().from(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1));
  const directions = syncBestchangeDirections(
    row ? UpdateAdminBestchangeBody.shape.directions.parse(row.directions) : [],
    await options(),
    await db.select().from(manualDeskPricingRulesTable),
  );
  return row ? {
    enabled: row.enabled, version: row.version,
    xmlPercentageAdjustment: row.xmlPercentageAdjustment,
    directions,
    updatedAt: row.updatedAt.toISOString(),
  } : { enabled: true, version: 0, directions, xmlPercentageAdjustment: { ...DEFAULT_XML_PERCENTAGE_ADJUSTMENT } };
}
onBestchangeConfigurationChange(invalidate);
async function options() {
  const reserves = new Map((await db.select().from(fiatCurrencyPaymentMethodsTable))
    .map(row => [`fiat:${row.fiatCurrencyId}:${row.paymentMethodId}`, plainDecimal(row.reserve)]));
  return [...await listPublicFiatSettlementOptions(), ...await listPublicManualCryptoSettlementOptions()]
    .map(option => ({ ...option, reserve: reserves.get(option.id) }));
}
function validateDirections(directions: BestchangeDirection[]) {
  const ids = new Set<string>();
  for (const direction of directions) {
    if (ids.has(direction.id)) throw new ApiError("BESTCHANGE_INVALID", "Direction IDs must be unique.", 400);
    ids.add(direction.id);
    const automatic = isAutomaticBestchangeDirection(direction);
    if ((!currencyCodes.has(direction.fromCode) && !(automatic && !direction.fromCode)) ||
      (!currencyCodes.has(direction.toCode) && !(automatic && !direction.toCode))) {
      throw new ApiError("BESTCHANGE_INVALID", "Use official BestChange currency codes.", 400);
    }
    if (direction.fromCode && direction.fromCode === direction.toCode) throw new ApiError("BESTCHANGE_INVALID", "Choose two different BestChange currency codes.", 400);
    if (direction.cities.some(code => !cityCodes.has(code))) throw new ApiError("BESTCHANGE_INVALID", "Use official BestChange city codes.", 400);
    if (direction.cities.length && ![direction.fromCode, direction.toCode].some(code => code.startsWith("CASH"))) {
      throw new ApiError("BESTCHANGE_INVALID", "City tags are only valid for cash directions.", 400);
    }
    if (!automatic && (compareDecimal(direction.minAmount, "0") <= 0 || compareDecimal(direction.maxAmount, direction.minAmount) < 0)) {
      throw new ApiError("BESTCHANGE_INVALID", "A positive minimum and maximum at least equal to minimum are required.", 400);
    }
    // The Swap contract supports up to twelve significant digits.
    for (const amount of [direction.minAmount, direction.maxAmount]) {
      const significant = plainDecimal(amount).replace(".", "").replace(/^0+/, "");
      if (significant.length > 12 || Number(amount) >= 1e12) {
        throw new ApiError("BESTCHANGE_INVALID", "Source limits must fit Swap's twelve-significant-digit amount contract.", 400);
      }
    }
    if (!automatic && direction.enabled && directions.some(other => !isAutomaticBestchangeDirection(other) &&
      other.id !== direction.id && other.enabled &&
      other.fromCode === direction.fromCode && other.toCode === direction.toCode &&
      (!other.cities.length || !direction.cities.length || other.cities.some(city => direction.cities.includes(city))))) {
      throw new ApiError("BESTCHANGE_INVALID", "Only one enabled direction may publish the same BestChange pair in an overlapping city.", 400);
    }
  }
}
async function exportDirection(
  direction: BestchangeDirection, reserve: string, prepareQuotes = prepareBestchangeSwapQuotes,
): Promise<BestchangeItem> {
  const live = await prepareQuotes(direction.sourceOptionId, direction.targetOptionId, direction.selectedAddOnKeys);
  const min = Math.max(Number(direction.minAmount), live.effectiveMinAmount ?? 0);
  const max = Math.min(Number(direction.maxAmount), live.effectiveMaxAmount ?? Infinity);
  if (!(min > 0 && Number.isFinite(max) && max >= min)) throw new BestchangeExportError("The configured limits do not overlap the current Swap limits.");
  const samples = pricingSamples(min, max, live.tiers ?? [], live.rangeOnlyPricing);
  const quotes: Array<{ amount: number; receive: string }> = [];
  // Bounded per-direction work, no parallel DB fan-out for each amount.
  for (const amount of samples) quotes.push({ amount, receive: await live.quote(amount) });
  const price = conservativePrice(quotes, live.targetPrecision, direction.selectedAddOnKeys.length);
  const maxReceive = quotes.find(quote => quote.amount === max)!.receive;
  return {
    from: direction.fromCode, to: direction.toCode, in: price.input, out: price.output,
    amount: direction.targetOptionId.startsWith("fiat:")
      ? plainDecimal(reserve) : smallerDecimal(plainDecimal(reserve), maxReceive),
    minamount: plainDecimal(min), maxamount: plainDecimal(max),
    ...(direction.includeFeeTags ? { fromfee: "0", tofee: "0" } : {}),
    ...(direction.floating !== undefined ? { floating: direction.floating } : {}),
    ...(direction.delay !== undefined ? { delay: direction.delay } : {}),
    param: [...new Set(["manual", ...direction.params])].join(", "),
    ...(direction.cities.length ? { city: direction.cities.join(", ") } : {}),
  };
}
export async function generate(
  config: BestchangeSettings, prepareQuotes = prepareBestchangeSwapQuotes,
  readActiveConvertOrder = hasActiveConvertOrderForXml,
): Promise<BestchangePreview> {
  const adjustment = config.xmlPercentageAdjustment ?? DEFAULT_XML_PERCENTAGE_ADJUSTMENT;
  // One current activity snapshot for the entire document, never one per pair.
  // OFF skips the order read altogether and preserves the original feed.
  const hasActiveConvertOrders = adjustment.enabled ? await readActiveConvertOrder() : false;
  const items: Array<BestchangeItem | undefined> = Array(config.directions.length);
  const diagnostics: BestchangePreview["diagnostics"] = Array(config.directions.length);
  // Read each destination once so every direction in this XML shares the same
  // reserve, even if an operator saves while its pricing is being calculated.
  const reserveByTarget = new Map<string, Promise<string | undefined>>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, config.directions.length) }, async () => {
    while (cursor < config.directions.length) {
      const index = cursor++, direction = config.directions[index];
      if (!direction.enabled) {
        diagnostics[index] = { id: direction.id, exported: false, message: "Direction disabled." };
        continue;
      }
      if (direction.pendingReasons?.length) {
        diagnostics[index] = { id: direction.id, exported: false, message: `Pending setup: ${direction.pendingReasons.join(" ")}` };
        continue;
      }
      try {
        let reserve: string | undefined = direction.reserve ?? "0";
        if (direction.targetOptionId.startsWith("fiat:")) {
          let read = reserveByTarget.get(direction.targetOptionId);
          if (!read) {
            read = getDestinationPaymentMethodReserve(direction.targetOptionId);
            reserveByTarget.set(direction.targetOptionId, read);
          }
          reserve = await read;
        }
        if (reserve === undefined) throw new BestchangeExportError("Destination Payment Method no longer exists.");
        if (compareDecimal(reserve, "0") === 0) {
          diagnostics[index] = { id: direction.id, exported: false, message: "Zero destination reserve: not exported." };
          continue;
        }
        items[index] = await exportDirection(direction, reserve, prepareQuotes);
        diagnostics[index] = { id: direction.id, exported: true, message:
          "Live fee-inclusive Swap rate; conservative standard-format range pricing." +
          (adjustment.enabled
            ? ` XML-only adjustment: +${selectedXmlPercentage(adjustment, hasActiveConvertOrders)}% (${hasActiveConvertOrders ? "active Convert orders" : "no active Convert orders"}). Customer quotes are not adjusted.`
            : "") };
      } catch (error) {
        diagnostics[index] = {
          id: direction.id, exported: false,
          message: error instanceof BestchangeExportError || error instanceof ApiError
            ? error.message : "Cannot currently price this direction. Check Swap availability, limits and add-on selections.",
        };
      }
    }
  }));
  const valid = items.filter((item): item is BestchangeItem => Boolean(item));
  return {
    xml: serializeBestchangeXml(valid.map(item => ({
      ...item, out: adjustXmlOutput(item.out, adjustment, hasActiveConvertOrders),
    }))), generatedAt: new Date().toISOString(),
    exportedCount: valid.length, diagnostics, enabled: config.enabled, version: config.version,
    xmlAdjustmentEnabled: adjustment.enabled,
    activeConvertOrdersForAdjustment: hasActiveConvertOrders,
  };
}
export async function snapshot(
  readSettings = settings,
  prepareQuotes = prepareBestchangeSwapQuotes,
  readActiveConvertOrder = hasActiveConvertOrderForXml,
): Promise<BestchangePreview> {
  let currentActivity: boolean | undefined;
  const existing = cached;
  if (existing && existing.expires > Date.now()) {
    const epoch = generation;
    currentActivity = existing.result.xmlAdjustmentEnabled ? await readActiveConvertOrder() : undefined;
    if (epoch !== generation || existing !== cached) return snapshot(readSettings, prepareQuotes, readActiveConvertOrder);
    if (currentActivity === undefined || currentActivity === existing.result.activeConvertOrdersForAdjustment) return existing.result;
    // Order activity must not wait for a rate cache TTL to choose the right %.
    // Reuse the same generation fence as operator configuration changes.
    invalidate();
  }
  if (!pending) {
    if (refreshBlockedUntil > Date.now()) throw new ApiError("BESTCHANGE_UNAVAILABLE", "Feed refresh is temporarily unavailable.", 503);
    const epoch = generation;
    const current = (async () => {
      try {
        const config = await readSettings();
        const result = config.enabled ? await generate(config, prepareQuotes,
          currentActivity === undefined ? readActiveConvertOrder : async () => currentActivity!) : {
          xml: serializeBestchangeXml([]), generatedAt: new Date().toISOString(),
          exportedCount: 0, diagnostics: [], enabled: false, version: config.version,
        };
        if (epoch === generation) cached = { expires: Date.now() + CACHE_MS, result };
        return result;
      } catch (error) {
        if (epoch === generation) refreshBlockedUntil = Date.now() + CACHE_MS;
        throw error;
      } finally {
        if (epoch === generation) pending = undefined;
      }
    })();
    pending = current;
  }
  const epoch = generation;
  const active = pending;
  if (!active) throw new ApiError("BESTCHANGE_UNAVAILABLE", "Feed refresh is temporarily unavailable.", 503);
  const result = await active;
  // A disabling save must win even when an older refresh just finished.
  return epoch === generation ? result : snapshot(readSettings, prepareQuotes, readActiveConvertOrder);
}

router.get("/bestchange.xml", async (_req, res, next) => {
  try {
    const feed = await snapshot();
    // BestChange robots need a full fresh response, never CDN/browser caching.
    res.set({
      "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff",
      "Content-Type": "application/xml; charset=utf-8",
    }).end(feed.xml);
  } catch (error) { next(error); }
});
router.get("/admin/bestchange", requireOwner, async (_req, res, next) => {
  try {
    const catalog = await options();
    res.set("Cache-Control", "no-store").json(GetAdminBestchangeResponse.parse({
      settings: await settings(),
      options: catalog.map(option => ({
        id: option.id, label: `${option.title} · ${option.assetCode} / ${option.routeNetwork}`,
        assetCode: option.assetCode, network: option.routeNetwork, direction: option.direction, kind: option.kind,
        reserve: option.reserve,
      })),
      ...reference, feedPath: "/api/bestchange.xml",
    }));
  } catch (error) { next(error); }
});
router.put("/admin/bestchange", requireOwner, async (req, res, next) => {
  try {
    const input = UpdateAdminBestchangeBody.parse(req.body);
    validateDirections(input.directions);
    const catalog = await options();
    for (const direction of input.directions.filter(row => row.enabled && !isAutomaticBestchangeDirection(row))) {
      const source = catalog.find(option => option.id === direction.sourceOptionId);
      const target = catalog.find(option => option.id === direction.targetOptionId);
      if (!source || !target || source.id === target.id ||
        !["send", "both"].includes(source.direction) || !["receive", "both"].includes(target.direction) ||
        (source.kind !== "fiat-payment-method" && target.kind !== "fiat-payment-method")) {
        throw new ApiError("BESTCHANGE_INVALID", "An enabled direction must use currently available Swap send/receive options and at least one fiat payment method.", 400);
      }
    }
    const row = {
      id: 1, enabled: input.enabled, version: input.version + 1,
      // Older clients may omit the new field: do not reset saved percentages.
      ...(input.xmlPercentageAdjustment ? { xmlPercentageAdjustment: input.xmlPercentageAdjustment } : {}),
      directions: input.directions.map(({ automatic, pricingRuleName, pendingReasons, ...direction }) => direction), updatedAt: new Date(),
    };
    const saved = input.version === 0
      ? await db.insert(bestchangeSettingsTable).values(row).onConflictDoNothing().returning()
      : await db.update(bestchangeSettingsTable).set(row)
        .where(and(eq(bestchangeSettingsTable.id, 1), eq(bestchangeSettingsTable.version, input.version))).returning();
    if (!saved.length) throw new ApiError("BESTCHANGE_CONFLICT", "Settings changed in another session. Reload before saving.", 409);
    invalidate();
    res.json(UpdateAdminBestchangeResponse.parse(await settings()));
  } catch (error) { next(error); }
});
router.get("/admin/bestchange/preview", requireOwner, async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(GetAdminBestchangePreviewResponse.parse(await generate(await settings())));
  } catch (error) { next(error); }
});
router.get("/admin/bestchange/reserves/export", requireOwner, async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json(await exportBestchangeReserves()); }
  catch (error) { next(error); }
});
router.post("/admin/bestchange/reserves/preview", requireOwner, async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(
      await previewBestchangeReserves(PreviewAdminBestchangeReservesBody.strict().parse(req.body)));
  } catch (error) { next(error); }
});
router.post("/admin/bestchange/reserves/apply", requireOwner, async (req, res, next) => {
  try {
    const approval = ApplyAdminBestchangeReservesBody.strict().parse(req.body);
    res.set("Cache-Control", "no-store").json(await applyBestchangeReserves(
      approval.transfer, approval.reviewHash, {
        actorClerkUserId: getOperatorActorUserId(req),
        operator: res.locals.operator as OperatorAuthorization, requestId: String(req.id),
      },
    ));
  } catch (error) { next(error); }
});
export default router;