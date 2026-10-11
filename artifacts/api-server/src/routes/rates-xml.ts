import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bestchangeSettingsTable, fiatCurrencyPaymentMethodsTable, manualDeskPricingRulesTable } from "@workspace/db";
import {
  GetAdminRatesXmlResponse, GetAdminRatesXmlPreviewResponse,
  UpdateAdminRatesXmlMethodBody, ActivateAdminRatesXmlBody,
} from "@workspace/api-zod";
import { requireOwner } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import { compareDecimal } from "../lib/bestchange-xml";
import { buildRatesXmlPreview, invalidateRatesXml } from "../lib/rates-xml-export";
import {
  readXmlAdmin, readXmlSettings, readXmlMethods, XML_CODE_LOOKUP, xmlStaging, xmlReviewHash,
} from "../lib/rates-xml-methods";
import { legacyRatesXml } from "./bestchange";

const router: IRouter = Router();
const stale = () => new ApiError("CONFIGURATION_CHANGED", "XML settings changed. Refresh and review before saving.", 409);

router.get("/rates.xml", async (_req, res, next) => {
  try {
    const row = await readXmlSettings();
    const xml = !xmlStaging() && !row?.ratesXmlPublished
      ? await legacyRatesXml()
      : row && !row.enabled
        ? '<?xml version="1.0" encoding="UTF-8"?>\n<rates>\n</rates>'
        : (await buildRatesXmlPreview()).xml;
    res.status(200).set({
      "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    }).end(xml);
  } catch (error) { next(error); }
});
router.get("/admin/rates-xml", requireOwner, async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json(GetAdminRatesXmlResponse.parse(await readXmlAdmin())); }
  catch (error) { next(error); }
});
router.get("/admin/rates-xml/preview", requireOwner, async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json(GetAdminRatesXmlPreviewResponse.parse(await buildRatesXmlPreview())); }
  catch (error) { next(error); }
});
router.patch("/admin/rates-xml/method", requireOwner, async (req, res, next) => {
  try {
    const input = UpdateAdminRatesXmlMethodBody.parse(req.body);
    if (input.code === undefined && input.reserve === undefined)
      throw new ApiError("VALIDATION_ERROR", "Choose an XML code or reserve to update.", 400);
    const row = await readXmlSettings(), { methods } = await readXmlMethods(row);
    const method = methods.find(m => m.optionId === input.optionId);
    if (!method) throw new ApiError("NOT_FOUND", "This settlement method no longer exists.", 404);
    if (input.code) {
      const code = XML_CODE_LOOKUP.get(input.code);
      if (!code || (code.type === "fiat") !== (method.kind === "fiat"))
        throw new ApiError("VALIDATION_ERROR", "Select the appropriate code from the supplied currency list.", 400);
    }
    if (input.reserve !== undefined &&
      (!/^\d{1,20}(?:\.\d{1,18})?$/.test(input.reserve) || input.expectedReserve === undefined))
      throw new ApiError("VALIDATION_ERROR", "Enter a nonnegative reserve with at most 20 integer and 18 decimal digits and review its current value.", 400);
    await db.transaction(async tx => {
      await tx.insert(bestchangeSettingsTable).values({ id: 1, enabled: true, version: 0 }).onConflictDoNothing();
      const [locked] = await tx.select().from(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1)).for("update");
      if (!locked || locked.version !== input.version) throw stale();
      const updated = new Map(locked.xmlMethodSettings.map(m => [m.optionId, m]));
      // Preserve and freeze only unambiguous existing operator declarations.
      for (const m of methods) if (!updated.has(m.optionId)) updated.set(m.optionId, {
        optionId: m.optionId, code: m.code, ...(m.kind !== "fiat" ? { reserve: m.reserve } : {}),
      });
      const entry = updated.get(input.optionId)!;
      if (input.code !== undefined) entry.code = input.code || null;
      if (input.reserve !== undefined) {
        if (method.kind === "fiat") {
          const [, currencyId, methodId] = input.optionId.split(":");
          const attachment = await tx.select().from(fiatCurrencyPaymentMethodsTable)
            .where(eq(fiatCurrencyPaymentMethodsTable.fiatCurrencyId, currencyId)).for("update");
          const current = attachment.find(a => a.paymentMethodId === methodId);
          if (!current || compareDecimal(current.reserve, input.expectedReserve!) !== 0) throw stale();
          await tx.update(fiatCurrencyPaymentMethodsTable).set({ reserve: input.reserve })
            .where(eq(fiatCurrencyPaymentMethodsTable.id, current.id));
        } else {
          if (compareDecimal(entry.reserve ?? method.reserve, input.expectedReserve!) !== 0) throw stale();
          entry.reserve = input.reserve;
        }
      }
      await tx.update(bestchangeSettingsTable).set({
        xmlMethodSettings: [...updated.values()], version: locked.version + 1, updatedAt: new Date(),
      }).where(eq(bestchangeSettingsTable.id, 1));
    });
    invalidateRatesXml();
    res.json(GetAdminRatesXmlResponse.parse(await readXmlAdmin()));
  } catch (error) { next(error); }
});
router.post("/admin/rates-xml/activate", requireOwner, async (req, res, next) => {
  try {
    const input = ActivateAdminRatesXmlBody.parse(req.body);
    if (!input.confirm) throw new ApiError("VALIDATION_ERROR", "Confirm that the staging XML has been reviewed.", 400);
    const preview = await buildRatesXmlPreview(false);
    if (!preview.exportedCount) throw new ApiError("XML_NOT_READY", "No production-ready directions exist. Configure codes, limits and live pricing first.", 422);
    if (preview.reviewHash !== input.reviewHash) throw stale();
    await db.transaction(async tx => {
      const [locked] = await tx.select().from(bestchangeSettingsTable).where(eq(bestchangeSettingsTable.id, 1)).for("update");
      if (!locked || locked.version !== input.version) throw stale();
      // Fence non-XML reserve/catalog edits as well as the configuration version.
      const { methods, catalogFingerprint } = await readXmlMethods(locked);
      const pricing = await tx.select().from(manualDeskPricingRulesTable);
      if (xmlReviewHash(locked.version, methods, { pricing, catalogFingerprint }) !== input.reviewHash) throw stale();
      await tx.update(bestchangeSettingsTable).set({
        enabled: true, ratesXmlPublished: true,
        xmlMethodSettings: methods.map(m => ({
          optionId: m.optionId, code: m.code, ...(m.kind !== "fiat" ? { reserve: m.reserve } : {}),
        })),
        version: locked.version + 1, updatedAt: new Date(),
      }).where(eq(bestchangeSettingsTable.id, 1));
    });
    invalidateRatesXml();
    res.json(GetAdminRatesXmlResponse.parse(await readXmlAdmin()));
  } catch (error) { next(error); }
});
export default router;
