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
export type ProfitBasis = z.infer<typeof ProfitBasisInput>;
export type ProfitRate = z.infer<typeof ProfitRateInput> & { id: string; effectiveAt: string };
export type ProfitRow = {
  key: string; id: string; type: "Swap" | "Convert"; createdAt: string; completedAt: string | null;
  status: string; fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
  amount: string; receiveAmount: string; paymentMethod: string;
  customerRate: string | null; basis: ProfitBasis | null; basisId: string | null;
  revenue: string | null; acquisitionCost: string | null; fees: string | null;
  grossSpread: string | null; netProfit: string | null; adjustments: string;
  state: "verified" | "missing" | "reversed"; href: string;
  audit: { id: string; kind: string; currency: string; amount: string | null; reason: string; createdAt: string }[];
};
export type ProfitReport = {
  rows: ProfitRow[]; total: number; page: number; pageSize: number; owner: boolean;
  currencies: string[]; routes: { fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string; fromOptionId?: string; toOptionId?: string }[];
  methods: string[]; rules: ProfitRate[];
  summary: { currency: string; revenue: string; acquisitionCost: string; fees: string; costs: string; profit: string; adjustments: string; valued: number }[];
  completedOrders: number; missingCosts: number;
  volume: { currency: string; amount: string }[];
};
