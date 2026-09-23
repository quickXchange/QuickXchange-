import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { GetExchangeConfigResponse } from "@workspace/api-zod";
import { db, manualDeskPricingRulesTable } from "@workspace/db";
import { listEnabledFiatCurrencies } from "../lib/fiat-currencies";
import { evaluateManualPricingCoverage } from "../lib/manual-desk-pricing";
import { listPublicManualCryptoSettlementOptions } from "../lib/manual-crypto";
import { listPublicFiatSettlementOptions } from "../lib/payment-methods";
import {
  convertProviderLabel,
  listConvertSettlementOptions,
} from "../lib/convert-provider-boundary";

const router: IRouter = Router();

router.get("/exchange/config", async (_req, res, next) => {
  try {
    const [
      fiatCurrencies,
      manualCryptoOptions,
      manualFiatOptions,
      pricingRules,
      instantOptions,
    ] = await Promise.all([
      listEnabledFiatCurrencies(),
      listPublicManualCryptoSettlementOptions(),
      listPublicFiatSettlementOptions(),
      db.select().from(manualDeskPricingRulesTable)
        .where(eq(manualDeskPricingRulesTable.enabled, true)),
      listConvertSettlementOptions({
        cacheOnly: process.env.NODE_ENV !== "test",
      }),
    ]);
    const fiatAssets = fiatCurrencies.map((currency) => ({
      id: currency.id,
      code: currency.code,
      name: currency.name,
      kind: "fiat",
      network: currency.network,
      requiresMemo: false,
      precision: currency.precision,
    }));
    const coverage = evaluateManualPricingCoverage(
      pricingRules,
      [...manualCryptoOptions, ...manualFiatOptions],
    );
    const manualAssets = manualCryptoOptions.map((option) => ({
      id: option.networkSlug,
      code: option.assetCode,
      name: option.title,
      kind: "crypto",
      network: option.routeNetwork,
      requiresMemo: option.requiresMemo,
      precision: 8,
    }));
    res.setHeader("cache-control", "no-store");
    res.json(GetExchangeConfigResponse.parse({
      assets: [...manualAssets, ...fiatAssets].sort((a, b) =>
        (a.code + "\0" + a.network + "\0" + a.id)
          .localeCompare(b.code + "\0" + b.network + "\0" + b.id)),
      fiatCurrencies: fiatCurrencies.map(({ code }) => code),
      settlementOptions: [...manualCryptoOptions, ...manualFiatOptions, ...instantOptions],
      manualSettlementOptions: [...manualCryptoOptions, ...manualFiatOptions],
      instantSettlementOptions: instantOptions,
      manualRouteAvailability: {
        available: coverage.coveredRoutes.length > 0,
        routes: coverage.coveredRoutes,
        unavailableMessage: coverage.coveredRoutes.length > 0
          ? null
          : "Manual Swap is temporarily unavailable because no routes are configured.",
      },
      providers: instantOptions.length
        ? ["Manual desk", convertProviderLabel()]
        : ["Manual desk"],
      feePercent: 0.6,
      manualPricingMessage:
        "Manual desk fees vary by route and payment or payout method and are included in each quote.",
    }));
  } catch (error) {
    next(error);
  }
});

export default router;