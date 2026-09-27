import { Router, type IRouter } from "express";
import {
  GetAdminSwapDefaultPairResponse,
  GetExchangeConfigResponse,
  UpdateAdminSwapDefaultPairBody,
  UpdateAdminSwapDefaultPairResponse,
} from "@workspace/api-zod";
import { listEnabledFiatCurrencies } from "../lib/fiat-currencies";
import { ApiError } from "../lib/api-error";
import {
  getEffectiveSwapDefaultPair,
  getPersistedSwapDefaultPair,
  getPublicManualSwapCoverage,
  savePersistedSwapDefaultPair,
} from "../lib/manual-swap-default-pair";
import {
  convertProviderLabel,
  listConvertSettlementOptions,
} from "../lib/convert-provider-boundary";

const router: IRouter = Router();

router.get("/exchange/config", async (_req, res, next) => {
  try {
    const [
      fiatCurrencies,
      swapData,
      instantOptions,
    ] = await Promise.all([
      listEnabledFiatCurrencies(),
      getPublicManualSwapCoverage(),
      listConvertSettlementOptions({
        cacheOnly: process.env.NODE_ENV !== "test",
      }),
    ]);
    const { cryptoOptions: manualCryptoOptions, fiatOptions: manualFiatOptions, coverage } = swapData;
    const fiatAssets = fiatCurrencies.map((currency) => ({
      id: currency.id,
      code: currency.code,
      name: currency.name,
      kind: "fiat",
      network: currency.network,
      requiresMemo: false,
      precision: currency.precision,
    }));
    const defaultSwapPair = await getEffectiveSwapDefaultPair(coverage.coveredRoutes);
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
      ...(defaultSwapPair ? { defaultSwapPair } : {}),
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

router.get("/admin/swap-default-pair", async (_req, res): Promise<void> => {
  const pair = await getPersistedSwapDefaultPair();
  res.setHeader("cache-control", "no-store");
  res.json(GetAdminSwapDefaultPairResponse.parse({ pair }));
});

router.put("/admin/swap-default-pair", async (req, res): Promise<void> => {
  const input = UpdateAdminSwapDefaultPairBody.safeParse(req.body);
  const bodyKeys = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? Object.keys(req.body)
    : [];
  if (
    !input.success ||
    bodyKeys.length !== 2 ||
    !bodyKeys.includes("sourceSettlementOptionId") ||
    !bodyKeys.includes("targetSettlementOptionId")
  ) {
    throw new ApiError("VALIDATION_ERROR", "The default Swap pair body is invalid.", 400);
  }
  const { coverage } = await getPublicManualSwapCoverage();
  const pair = input.data;
  if (!coverage.coveredRoutes.some((route) =>
    route.sourceSettlementOptionId === pair.sourceSettlementOptionId &&
    route.targetSettlementOptionId === pair.targetSettlementOptionId
  )) {
    throw new ApiError(
      "SWAP_DEFAULT_PAIR_UNAVAILABLE",
      "The selected directed pair is not currently available for public Manual Swap.",
      409,
    );
  }
  await savePersistedSwapDefaultPair(pair);
  res.setHeader("cache-control", "no-store");
  res.json(UpdateAdminSwapDefaultPairResponse.parse({ pair }));
});

export default router;