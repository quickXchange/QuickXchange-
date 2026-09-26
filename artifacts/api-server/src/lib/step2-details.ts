import {
  verifyQuoteTicketForHistory,
  type QuoteTicket,
} from "./quote-ticket";

export type Step2CustomerDetail = {
  key: string;
  label: string;
  value: string;
};

type ManualStep2ProjectionInput = {
  type?: string;
  customerEmail?: unknown;
  customerName?: unknown;
  customerClerkUserId?: string | null;
  customerClaimedAt?: Date | string | null;
  customerOwnershipSource?: string | null;
  destinationAddress?: unknown;
  destinationMemo?: unknown;
  refundAddress?: unknown;
  refundMemo?: unknown;
  settlementDetails?: unknown;
  customerDetailsSnapshot?: unknown;
  settlementSnapshot?: unknown;
};

type SettlementFieldDefinition = {
  key?: unknown;
  label?: unknown;
  type?: unknown;
};

type Step2DetailsInput = {
  customerEmail?: unknown;
  customerName?: unknown;
  destinationAddress?: unknown;
  destinationMemo?: unknown;
  refundAddress?: unknown;
  refundMemo?: unknown;
  settlementDetails?: unknown;
  requiredFields?: unknown;
  quoteId?: string | null;
};

const forbiddenFieldNames = [
  "address source",
  "confirmations",
  "detected",
  "deposit provider",
  "diagnostic",
  "funding status",
  "internal",
  "logo url",
  "monitor",
  "network code",
  "network id",
  "provider",
  "quote id",
  "selected provider",
  "order status",
  "provider status",
  "transaction hash",
  "transaction id",
  "tx hash",
  "tx id",
  "txid",
  "whitebit",
];

function normalizedFieldName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isForbiddenFieldName(value: string, allowSettlementSidePrefix = false): boolean {
  const normalized = normalizedFieldName(value)
    .replace(allowSettlementSidePrefix ? /^(source|target) / : /$^/, "");
  if (normalized === "source" || normalized === "status") return true;
  return forbiddenFieldNames.some((forbidden) =>
    normalized === forbidden || normalized.startsWith(`${forbidden} `) ||
    normalized.endsWith(` ${forbidden}`) || normalized.includes(` ${forbidden} `));
}

function step2Value(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return undefined;
}

function safeDefinition(field: SettlementFieldDefinition): field is { key: string; label: string } {
  const validTypes = [
    "short-text", "long-text", "integer", "numeric", "decimal", "account-iban",
    "account-number", "account-name", "bank-code", "routing-number", "country-code",
    "postal-address", "phone", "email", "date", "select", "wallet-address", "memo-tag",
    "private-image", "text", "number", "textarea",
  ];
  return typeof field.key === "string" &&
    /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(field.key) &&
    typeof field.label === "string" &&
    field.label.trim().length > 0 &&
    field.label.trim().length <= 100 &&
    typeof field.type === "string" &&
    validTypes.includes(field.type) &&
    field.type !== "private-image" &&
    !isForbiddenFieldName(field.key, true) &&
    !isForbiddenFieldName(field.label);
}

function historicalQuoteFields(quoteId: string | null | undefined): unknown {
  if (!quoteId) return undefined;
  try {
    const ticket: QuoteTicket = verifyQuoteTicketForHistory(quoteId);
    return ticket.requiredSettlementFields;
  } catch {
    return undefined;
  }
}

function dynamicStep2Details(
  definitions: unknown,
  values: unknown,
): Step2CustomerDetail[] {
  if (!Array.isArray(definitions) || !values || typeof values !== "object" || Array.isArray(values)) {
    return [];
  }

  const submittedValues = values as Record<string, unknown>;
  const seenKeys = new Set<string>();
  const entries: Step2CustomerDetail[] = [];

  for (const definition of definitions as SettlementFieldDefinition[]) {
    if (!safeDefinition(definition) || seenKeys.has(definition.key)) continue;
    seenKeys.add(definition.key);
    if (!Object.prototype.hasOwnProperty.call(submittedValues, definition.key)) continue;
    const value = step2Value(submittedValues[definition.key]);
    if (!value) continue;
    entries.push({ key: definition.key, label: definition.label.trim(), value });
  }

  return entries;
}

export function projectStep2Details(input: Step2DetailsInput): Step2CustomerDetail[] | undefined {
  const definitions = input.requiredFields ?? historicalQuoteFields(input.quoteId);
  const details: Step2CustomerDetail[] = [];
  const addStandard = (key: string, label: string, value: unknown) => {
    const safeValue = step2Value(value);
    if (safeValue && !isForbiddenFieldName(label)) details.push({ key, label, value: safeValue });
  };

  addStandard("email", "Email", input.customerEmail);
  if (typeof input.customerName === "string" && input.customerName.trim().toLowerCase() !== "guest") {
    addStandard("name", "Name", input.customerName);
  }
  addStandard("destinationAddress", "Receiving Address", input.destinationAddress);
  addStandard("destinationMemo", "Receiving Memo / Tag", input.destinationMemo);
  addStandard("refundAddress", "Refund Address", input.refundAddress);
  addStandard("refundMemo", "Refund Memo / Tag", input.refundMemo);
  details.push(...dynamicStep2Details(definitions, input.settlementDetails));

  const seen = new Set<string>();
  const uniqueDetails = details.filter((detail) => {
    const identity = `${normalizedFieldName(detail.label)}:${detail.value}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  return uniqueDetails.length ? uniqueDetails : undefined;
}

export function projectManualOrderStep2Details(
  row: ManualStep2ProjectionInput,
): Step2CustomerDetail[] | undefined {
  if (row.type !== "manual") return undefined;
  const savedDetails = row.customerDetailsSnapshot &&
    typeof row.customerDetailsSnapshot === "object" &&
    !Array.isArray(row.customerDetailsSnapshot)
    ? row.customerDetailsSnapshot as Record<string, unknown>
    : {};
  const settlementSnapshot = row.settlementSnapshot &&
    typeof row.settlementSnapshot === "object" &&
    !Array.isArray(row.settlementSnapshot)
    ? row.settlementSnapshot as { requiredFields?: unknown }
    : {};

  return projectStep2Details({
    customerEmail: row.customerOwnershipSource !== "authenticated_create" &&
      (!row.customerClerkUserId ||
        row.customerOwnershipSource === "verified_email_claim" ||
        row.customerClaimedAt != null)
      ? row.customerEmail
      : undefined,
    customerName: row.customerName,
    destinationAddress: savedDetails.destinationAddress ?? row.destinationAddress,
    destinationMemo: savedDetails.destinationMemo ?? row.destinationMemo,
    refundAddress: row.refundAddress,
    refundMemo: row.refundMemo,
    settlementDetails: savedDetails.settlementDetails ?? row.settlementDetails,
    requiredFields: settlementSnapshot.requiredFields,
  });
}