import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, ratesXmlSettingsTable, fiatCurrencyPaymentMethodsTable } from "@workspace/db";
import {
  GetAdminRatesXmlResponse, GetAdminRatesXmlPreviewResponse, UpdateAdminRatesXmlMethodBody,
} from "@workspace/api-zod";
import { requireOwner } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import { compareDecimal } from "../lib/rates-xml-decimal";
import { buildRatesXmlPreview } from "../lib/rates-xml-export";
import { notifyRatesXmlChange } from "../lib/rates-xml-cache";
import { validateCurrencyReserve } from "../lib/payment-method-reserves";
import { readXmlAdmin, readXmlSettings, readXmlMethods, XML_CODE_LOOKUP } from "../lib/rates-xml-methods";

const router: IRouter = Router();
const stale = () => new ApiError("CONFIGURATION_CHANGED", "XML settings changed. Refresh before saving.", 409);
const xmlHeaders = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
};

router.get("/rates.xml", async (_req, res, next) => {
  try { res.status(200).set(xmlHeaders).end((await buildRatesXmlPreview()).xml); }
  catch (error) { next(error); }
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
      throw new ApiError("VALIDATION_ERROR", "Choose a supplied-list code or reserve to update.", 400);
    const row = await readXmlSettings(), { methods } = await readXmlMethods(row);
    const method = methods.find(m => m.optionId === input.optionId);
    if (!method) throw new ApiError("NOT_FOUND", "This settlement method no longer exists.", 404);
    if (input.code) {
      const code = XML_CODE_LOOKUP.get(input.code);
      if (!code || (code.type === "fiat") !== (method.kind === "fiat"))
        throw new ApiError("VALIDATION_ERROR", "Select the appropriate code from currency_codes.csv.", 400);
    }
    if (input.reserve !== undefined && (!/^\d{1,20}(?:\.\d{1,18})?$/.test(input.reserve) ||
        input.expectedReserve === undefined || !/^\d{1,20}(?:\.\d{1,18})?$/.test(input.expectedReserve)))
      throw new ApiError("VALIDATION_ERROR", "Enter a nonnegative reserve and review its current value.", 400);
    await db.transaction(async tx => {
      await tx.insert(ratesXmlSettingsTable).values({ id: 1 }).onConflictDoNothing();
      const [locked] = await tx.select().from(ratesXmlSettingsTable)
        .where(eq(ratesXmlSettingsTable.id, 1)).for("update");
      if (locked.version !== input.version) throw stale();
      const updated = new Map(locked.methods.map(m => [m.optionId, { ...m }]));
      const entry = updated.get(input.optionId) ?? {
        optionId: input.optionId, code: null, ...(method.kind !== "fiat" ? { reserve: method.reserve } : {}),
      };
      if (input.code !== undefined) entry.code = input.code || null;
      if (input.reserve !== undefined) {
        if (method.kind === "fiat") {
          const [, currencyId, methodId] = input.optionId.split(":");
          const [current] = await tx.select().from(fiatCurrencyPaymentMethodsTable).where(and(
            eq(fiatCurrencyPaymentMethodsTable.fiatCurrencyId, currencyId),
            eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, methodId),
          )).for("update");
          if (!current || compareDecimal(current.reserve, input.expectedReserve!) !== 0) throw stale();
          const reserve = await validateCurrencyReserve(tx, currencyId, input.reserve);
          await tx.update(fiatCurrencyPaymentMethodsTable).set({ reserve })
            .where(eq(fiatCurrencyPaymentMethodsTable.id, current.id));
        } else {
          if (compareDecimal(entry.reserve ?? method.reserve, input.expectedReserve!) !== 0) throw stale();
          entry.reserve = input.reserve;
        }
      }
      updated.set(input.optionId, entry);
      await tx.update(ratesXmlSettingsTable).set({
        methods: [...updated.values()], version: locked.version + 1, updatedAt: new Date(),
      }).where(eq(ratesXmlSettingsTable.id, 1));
    });
    notifyRatesXmlChange();
    res.json(GetAdminRatesXmlResponse.parse(await readXmlAdmin()));
  } catch (error) { next(error); }
});
export default router;
