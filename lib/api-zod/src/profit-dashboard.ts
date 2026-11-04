import { z } from "zod";

export const ProfitDecimal = z.string().regex(/^(?:0|[1-9]\d{0,23})(?:\.\d{1,18})?$/);
const symbol = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform(v => v.toUpperCase());
export const ProfitBasisInput = z.object({
  currency: symbol,
  sourceUnitValue: ProfitDecimal.refine(v => /[1-9]/.test(v), "Source unit value must be positive."),
  targetUnitCost: ProfitDecimal.refine(v => /[1-9]/.test(v), "Acquisition unit cost must be positive."),
  providerFee: ProfitDecimal,
  networkFee: ProfitDecimal,
  bankFee: ProfitDecimal,
  otherFee: ProfitDecimal,
  evidence: z.string().trim().min(8).max(2000),
  costsVerified: z.literal(true),
}).strict();
export const ProfitRateInput = ProfitBasisInput.extend({
  fromAsset: symbol,
  fromNetwork: z.string().trim().max(160),
  toAsset: symbol,
  toNetwork: z.string().trim().max(160),
  fromOptionId: z.string().trim().max(300).optional().default(""),
  toOptionId: z.string().trim().max(300).optional().default(""),
}).strict();
export const ProfitBasisRecordInput = ProfitBasisInput.extend({ requestId: z.string().uuid() }).strict();
export const ProfitAdjustmentInput = z.object({
  currency: symbol,
  amount: z.string().regex(/^-?(?:0|[1-9]\d{0,23})(?:\.\d{1,18})?$/),
  reason: z.string().trim().min(8).max(2000),
  requestId: z.string().uuid(),
}).strict();
export type LegacyProfitBasis = z.infer<typeof ProfitBasisInput>;
const positiveDecimal = ProfitDecimal.refine(v => /[1-9]/.test(v), "Must be greater than zero.");
const percentage = ProfitDecimal.refine(v => {
  if (!ProfitDecimal.safeParse(v).success) return false;
  const [whole, fraction = ""] = v.split(".");
  return BigInt(whole) < 100n || BigInt(whole) === 100n && !/[1-9]/.test(fraction);
}, "Percentage must be between 0 and 100.");
const tradeFields = {
  calculation: z.literal("trade"),
  currency: symbol,
  quantitySide: z.enum(["source", "target"]),
  buyMode: z.enum(["unit", "total"]),
  sellMode: z.enum(["unit", "total"]),
  buyValue: positiveDecimal,
  sellValue: positiveDecimal,
  buyCurrency: symbol,
  sellCurrency: symbol,
  buyFx: positiveDecimal,
  sellFx: positiveDecimal,
  commission1Percent: percentage.optional().default("0"),
  receivingCommissionPercent: percentage.optional().default("0"),
  additionalFixedFee: ProfitDecimal.optional().default("0"),
  evidence: z.string().trim().min(8).max(2000),
  costsVerified: z.literal(true),
};
const validateTradeFx = (v: { currency: string; buyCurrency: string; sellCurrency: string; buyFx: string; sellFx: string }, ctx: z.RefinementCtx) => {
  for (const side of ["buy", "sell"] as const) {
    if (v[`${side}Currency`] === v.currency && !/^1(?:\.0+)?$/.test(v[`${side}Fx`])) {
      ctx.addIssue({ code: "custom", path: [`${side}Fx`], message: "Conversion within the accounting currency must be exactly 1." });
    }
  }
};
export const ProfitTradeBasisInput = z.object(tradeFields).strict().superRefine(validateTradeFx);
export const ProfitTradeRecordInput = z.object({ ...tradeFields, requestId: z.string().uuid() }).strict().superRefine(validateTradeFx);
export const ProfitMyRateInput = z.object({
  kind: z.literal("my_rate"), asset: symbol, currency: symbol,
  network: z.string().trim().max(160).default(""),
  buyRate: positiveDecimal, sellRate: positiveDecimal,
  partnerFeePercent: percentage.default("0"), receivingFeePercent: percentage.default("0"),
  active: z.boolean().default(true), requestId: z.string().uuid(),
}).strict().refine(v => v.asset !== v.currency, "Asset and quote currency must differ.");
export type ProfitMyRate = z.infer<typeof ProfitMyRateInput> & { id: string; effectiveAt: string };
export const ProfitAccountingBasisInput = z.union([ProfitBasisInput, ProfitTradeBasisInput]);
export type ProfitTradeBasis = z.infer<typeof ProfitTradeBasisInput>;
export type ProfitBasis = z.infer<typeof ProfitAccountingBasisInput>;
export type ProfitRate = z.infer<typeof ProfitRateInput> & { id: string; effectiveAt: string };
export type ProfitRow = {
  key: string; id: string; type: "Swap" | "Convert"; createdAt: string; completedAt: string | null;
  status: string; fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
  amount: string; receiveAmount: string; paymentMethod: string;
  customerRate: string | null; basis: ProfitBasis | null; basisId: string | null;
  revenue: string | null; acquisitionCost: string | null; fees: string | null;
  grossSpread: string | null; netProfit: string | null; adjustments: string;
  state: "verified" | "missing" | "reversed" | "not_completed"; href: string;
  tradeDetails?: {
    asset: string; quantity: string; buyTotal: string; sellTotal: string;
    commission1: string; receivingCommission: string; additionalFixedFee: string;
  } | null;
  completion?: { at: string; rateId: string | null; state: "recorded" | "unavailable" | "pending"; reason?: string };
  audit: { id: string; kind: string; currency: string; amount: string | null; reason: string; createdAt: string }[];
};
export type ProfitReport = {
  rows: ProfitRow[]; total: number; page: number; pageSize: number; owner: boolean;
  currencies: string[]; routes: { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string; fromOptionId?: string; toOptionId?: string }[];
  methods: string[]; rules: ProfitRate[];
  summary: { currency: string; revenue: string; acquisitionCost: string; fees: string; costs: string; profit: string; adjustments: string; valued: number }[];
  completedOrders: number; missingCosts: number;
  volume: { currency: string; amount: string }[];
  assetKinds?: Record<string, "crypto" | "fiat">;
  myRates?: ProfitMyRate[];
  rateNetworks?: string[];
  periods?: {
    asOf: string; timeZone: "UTC"; dateBasis: "order_creation" | "completion";
    daily: ProfitPeriodTotal[]; weekly: ProfitPeriodTotal[]; monthly: ProfitPeriodTotal[]; total: ProfitPeriodTotal[];
  };
};
export type ProfitPeriodTotal = { currency: string; profit: string; orders: number };
