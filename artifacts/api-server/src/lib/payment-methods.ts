import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import {
  db,
  fiatCurrenciesTable,
  fiatCurrencyPaymentMethodsTable,
  paymentMethodsTable,
  type PaymentMethodFieldDefinition,
} from "@workspace/db";
import { paymentMethodBrandfetchLogoUrl } from "./payment-method-brandfetch";
import { ApiError } from "./api-error";

const FORBIDDEN = /\b(?:password|passcode|pin|otp|2fa|auth(?:entication)?(?:\s+|-)?code|verification(?:\s+|-)?code|cvv|cvc|pan|card(?:\s+|-)?number|seed(?:\s+|-)?phrase|recovery(?:\s+|-)?phrase|private(?:\s+|-)?key|security(?:\s+|-)?code|secret|credential|login)\b/i;

const STANDARD_FIAT_CUSTOMER_FIELDS = [
  {
    key: "name",
    type: "account-name",
    label: "Name",
    direction: "both",
    required: true,
    min: 2,
    max: 140,
  },
  {
    key: "bank_detail",
    type: "account-number",
    label: "Bank detail (IBAN or account number)",
    direction: "both",
    required: true,
    min: 2,
    max: 64,
  },
  {
    key: "bank_name",
    type: "short-text",
    label: "Bank name",
    direction: "both",
    required: true,
    min: 2,
    max: 140,
  },
  {
    key: "payment_description",
    type: "long-text",
    label: "Payment description",
    direction: "both",
    required: false,
    max: 500,
  },
  {
    key: "telegram_or_whatsapp",
    type: "short-text",
    label: "Your Telegram or WhatsApp",
    direction: "both",
    required: false,
    max: 100,
  },
] as const satisfies readonly PaymentMethodFieldDefinition[];

const STANDARD_FIAT_REPLACED_KEYS = new Set([
  "name",
  "recipient_name",
  "account_holder_name",
  "iban",
  "bank_account_number",
  "bank_detail",
  "bank_name",
  "payment_description",
  "telegram_or_whatsapp",
]);

function publicFiatCustomerFields(
  definitions: PaymentMethodFieldDefinition[],
): PaymentMethodFieldDefinition[] {
  const methodSpecificFields = definitions.filter((field) =>
    !STANDARD_FIAT_REPLACED_KEYS.has(field.key) &&
    !["account-name", "account-iban", "account-number"].includes(field.type)
  );
  return [
    ...STANDARD_FIAT_CUSTOMER_FIELDS.map((field) => ({ ...field })),
    ...methodSpecificFields,
  ];
}

function passesLuhn(value: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = value.length - 1; index >= 0; index--) {
    let digit = Number(value[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function containsForbiddenSecretMaterial(value: string): boolean {
  const cardCandidate = value.replace(/[\s-]/g, "");
  if (/^[0-9]{13,19}$/.test(cardCandidate) && passesLuhn(cardCandidate)) return true;
  if (
    /^(?:xprv|tprv|yprv|Yprv|zprv|Zprv|uprv|Uprv|vprv|Vprv)[1-9A-HJ-NP-Za-km-z]{40,}$/.test(value) ||
    /^(?:5[HJK][1-9A-HJ-NP-Za-km-z]{49}|[KL][1-9A-HJ-NP-Za-km-z]{51})$/.test(value) ||
    /^(?:0x)?[0-9a-f]{64}$/i.test(value)
  ) return true;
  const words = value.trim().split(/\s+/);
  return [12, 15, 18, 21, 24].includes(words.length) &&
    words.every((word) => /^[a-z]{2,16}$/i.test(word));
}

export function validateSafeFieldDefinitions(
  definitions: PaymentMethodFieldDefinition[],
): PaymentMethodFieldDefinition[] {
  const keys = new Set<string>();
  for (const field of definitions) {
    const safetyText = `${field.key} ${field.label} ${field.help ?? ""}`.replace(/[_-]+/g, " ");
    if (FORBIDDEN.test(safetyText)) {
      throw new ApiError(
        "UNSAFE_SETTLEMENT_FIELD",
        "Payment methods cannot request credentials, authentication codes, card security codes, recovery phrases, or private keys.",
        400,
      );
    }
    if (keys.has(field.key)) {
      throw new ApiError("DUPLICATE_SETTLEMENT_FIELD", `Duplicate field key: ${field.key}.`, 400);
    }
    keys.add(field.key);
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      throw new ApiError("INVALID_SETTLEMENT_FIELD", `Invalid range for ${field.key}.`, 400);
    }
    if (field.pattern) {
      try {
        new RegExp(field.pattern);
      } catch {
        throw new ApiError("INVALID_SETTLEMENT_FIELD", `Invalid pattern for ${field.key}.`, 400);
      }
    }
    if (field.type === "select" && !field.options?.length) {
      throw new ApiError("INVALID_SETTLEMENT_FIELD", `Select field ${field.key} requires options.`, 400);
    }
    if (field.type !== "select" && field.options?.length) {
      throw new ApiError("INVALID_SETTLEMENT_FIELD", `Only select field ${field.key} may define options.`, 400);
    }
  }
  for (const field of definitions) {
    if (
      field.requiredWhen &&
      (
        field.requiredWhen.fieldKey === field.key ||
        !keys.has(field.requiredWhen.fieldKey)
      )
    ) {
      throw new ApiError(
        "INVALID_SETTLEMENT_FIELD",
        `Conditional field ${field.key} must reference another field in the same method.`,
        400,
      );
    }
  }
  return definitions;
}

function fieldConditionMatches(
  field: PaymentMethodFieldDefinition,
  values: Record<string, unknown>,
): boolean {
  if (!field.requiredWhen) return true;
  const actual = values[field.requiredWhen.fieldKey];
  const expected = Array.isArray(field.requiredWhen.equals)
    ? field.requiredWhen.equals
    : [field.requiredWhen.equals];
  return typeof actual === "string" && expected.includes(actual);
}

export function validateSettlementDetails(
  schema: PaymentMethodFieldDefinition[],
  details: Record<string, unknown> | undefined,
): Record<string, string | number | null> {
  const values = details ?? {};
  const allowed = new Set(schema.map((field) => field.key));
  if (Object.keys(values).some((key) => !allowed.has(key))) {
    throw new ApiError("SETTLEMENT_DETAILS_INVALID", "Settlement details contain an unknown field.", 400);
  }
  const result: Record<string, string | number | null> = {};
  for (const field of schema) {
    const value = values[field.key];
    const applicable = fieldConditionMatches(field, values);
    if (!applicable) {
      if (value !== undefined && value !== null && value !== "") {
        throw new ApiError(
          "SETTLEMENT_DETAILS_INVALID",
          `${field.label} is not applicable to the selected settlement details.`,
          400,
        );
      }
      result[field.key] = null;
      continue;
    }
    if (value === undefined || value === null || value === "") {
      if (field.required || field.requiredWhen) {
        throw new ApiError("SETTLEMENT_DETAILS_REQUIRED", `${field.label} is required.`, 400);
      }
      result[field.key] = value === undefined ? null : value;
      continue;
    }
    if (field.type === "private-image") {
      // No upload capability is accepted until a quote-bound, access-controlled
      // object flow exists. Never turn an arbitrary object path into an upload hole.
      throw new ApiError("PRIVATE_IMAGE_UNAVAILABLE", "Private image collection is not available yet.", 422);
    }
    if (
      containsForbiddenSecretMaterial(String(value)) ||
      (typeof value === "number" && Number.isInteger(value) &&
        Math.abs(value) >= 1e12 && !Number.isSafeInteger(value))
    ) {
      throw new ApiError(
        "UNSAFE_SETTLEMENT_DETAIL",
        `${field.label} cannot contain card credentials, recovery phrases, or private keys.`,
        400,
      );
    }
    if (["number", "integer", "numeric", "decimal"].includes(field.type)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be a number.`, 400);
      }
      if (field.type === "integer" && !Number.isInteger(value)) {
        throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be an integer.`, 400);
      }
      if (field.min !== undefined && value < field.min || field.max !== undefined && value > field.max) {
        throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} is outside its allowed range.`, 400);
      }
      result[field.key] = value;
      continue;
    }
    if (typeof value !== "string") {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be text.`, 400);
    }
    if (field.type === "date") {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const date = match
        ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
        : undefined;
      if (!match || !date ||
          date.getUTCFullYear() !== Number(match[1]) ||
          date.getUTCMonth() !== Number(match[2]) - 1 ||
          date.getUTCDate() !== Number(match[3])) {
        throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be a valid date.`, 400);
      }
    }
    if (field.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be a valid email address.`, 400);
    }
    if (field.type === "phone" && !/^\+?[0-9 ()-]{6,30}$/.test(value)) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be a valid phone number.`, 400);
    }
    if (field.type === "account-iban" && !/^[A-Z]{2}[0-9A-Z]{13,32}$/i.test(value.replace(/\s/g, ""))) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be a valid IBAN.`, 400);
    }
    if (field.type === "country-code" && !/^[A-Z]{2}$/i.test(value)) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} must be a two-letter country code.`, 400);
    }
    if (
      ["account-number", "routing-number", "bank-code"].includes(field.type) &&
      !/^[A-Z0-9 ./'()+-]{2,64}$/i.test(value)
    ) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} has an invalid format.`, 400);
    }
    if (field.type === "select" && !field.options?.some((option) => option.value === value)) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} is not an allowed option.`, 400);
    }
    if (field.min !== undefined && value.length < field.min || field.max !== undefined && value.length > field.max) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} has an invalid length.`, 400);
    }
    if (field.pattern && !new RegExp(field.pattern).test(value)) {
      throw new ApiError("SETTLEMENT_DETAILS_INVALID", `${field.label} has an invalid format.`, 400);
    }
    result[field.key] = value;
  }
  return result;
}

export async function listPublicFiatSettlementOptions() {
  const rows = await db.select({
    attachment: fiatCurrencyPaymentMethodsTable,
    currency: fiatCurrenciesTable,
    method: paymentMethodsTable,
  }).from(fiatCurrencyPaymentMethodsTable)
    .innerJoin(fiatCurrenciesTable, eq(fiatCurrencyPaymentMethodsTable.fiatCurrencyId, fiatCurrenciesTable.id))
    .innerJoin(paymentMethodsTable, eq(fiatCurrencyPaymentMethodsTable.paymentMethodId, paymentMethodsTable.id))
    .where(and(
      eq(fiatCurrencyPaymentMethodsTable.enabled, true),
      eq(fiatCurrenciesTable.enabled, true),
      ne(fiatCurrenciesTable.lifecycle, "deprecated"),
      eq(paymentMethodsTable.enabled, true),
      ne(paymentMethodsTable.lifecycle, "deprecated"),
      eq(paymentMethodsTable.executionMode, "manual"),
    ))
    .orderBy(
      desc(fiatCurrencyPaymentMethodsTable.enabled),
      sql`case ${paymentMethodsTable.lifecycle} when 'active' then 0 when 'restricted' then 1 else 2 end`,
      asc(paymentMethodsTable.name),
      asc(fiatCurrencyPaymentMethodsTable.paymentMethodId),
      asc(fiatCurrencyPaymentMethodsTable.id),
    );
  return rows.flatMap(
    ({ attachment, currency, method }) => {
      const send = attachment.canSend ?? method.canSend;
      const receive = attachment.canReceive ?? method.canReceive;
      if (!send && !receive) return [];
      return [{
        id: `fiat:${currency.id}:${method.id}`,
        assetId: currency.id,
        assetCode: currency.code,
        routeNetwork: currency.network,
        kind: "fiat-payment-method" as const,
        title: method.name,
        direction: send && receive ? "both" as const : send ? "send" as const : "receive" as const,
        family: method.family,
        executionMode: method.executionMode as "catalog" | "manual" | "api",
        providerId: method.providerId ?? undefined,
        lifecycle: method.lifecycle as "active" | "restricted" | "deprecated",
        regions: method.regions,
        countries: attachment.countries.length ? attachment.countries : method.countries,
        requiresProviderConfiguration: method.requiresProviderConfiguration,
        minAmount: attachment.minAmount ?? undefined,
        maxAmount: attachment.maxAmount ?? undefined,
        paymentMethodId: method.id,
        logoUrl: method.logoObjectPath
          ? `/api/storage${method.logoObjectPath}`
          : undefined,
         flagUrl: currency.flagObjectPath
           ? `/api/storage${currency.flagObjectPath}`
           : undefined,
        instructions: method.instructions ?? undefined,
        sendInstructions: attachment.sendInstructions ?? method.instructions ?? undefined,
        receiveInstructions: attachment.receiveInstructions ?? method.instructions ?? undefined,
        fields: publicFiatCustomerFields(method.fieldDefinitions),
      }];
    },
  );
}