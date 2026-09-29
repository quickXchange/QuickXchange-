import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

type PaymentMethodFieldDefinitionWithOptionalKey =
  Omit<PaymentMethodFieldDefinition, "key"> & { key?: string | null };

function automaticFieldKeyBase(label: unknown): string {
  const normalized = (typeof label === "string" ? label : "field")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const startsWithLetter = /^[a-z]/.test(normalized)
    ? normalized
    : `field_${normalized}`;
  return (startsWithLetter || "field").slice(0, 64).replace(/_+$/g, "") || "field";
}

export function assignAutomaticFieldDefinitionKeys(
  definitions: PaymentMethodFieldDefinitionWithOptionalKey[],
): PaymentMethodFieldDefinition[] {
  const usedKeys = new Set(
    definitions
      .map(field => typeof field.key === "string" ? field.key : "")
      .filter(key => Boolean(key) && !key.startsWith("__auto__")),
  );

  return definitions.map(field => {
    if (
      typeof field.key === "string" &&
      field.key.length > 0 &&
      !field.key.startsWith("__auto__")
    ) {
      return field as PaymentMethodFieldDefinition;
    }

    const base = automaticFieldKeyBase(field.label);
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      const suffixText = `_${suffix}`;
      key = `${base.slice(0, 64 - suffixText.length).replace(/_+$/g, "")}${suffixText}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return { ...field, key } as PaymentMethodFieldDefinition;
  });
}

export function assignAutomaticPaymentMethodFieldKeys(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.fieldDefinitions)) return body;
  if (record.fieldDefinitions.some(
    field => !field || typeof field !== "object" || Array.isArray(field),
  )) return body;
  return {
    ...record,
    fieldDefinitions: assignAutomaticFieldDefinitionKeys(
      record.fieldDefinitions as PaymentMethodFieldDefinitionWithOptionalKey[],
    ),
  };
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

export type PaymentMethodFieldMergeSummary = {
  fieldDefinitions: PaymentMethodFieldDefinition[];
  added: string[];
  modified: string[];
  unchanged: string[];
  directionMismatches: string[];
};

function normalizedFieldLabel(label: string): string {
  return label.normalize("NFKC").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizedFieldIdentity(label: string): string {
  const normalized = normalizedFieldLabel(label);
  const aliases: Record<string, string> = {
    name: "accountname",
    accountname: "accountname",
    iban: "accountiban",
    accountiban: "accountiban",
    paymentdescription: "paymentreference",
    description: "paymentreference",
    paymentreference: "paymentreference",
    reference: "paymentreference",
  };
  return aliases[normalized] ?? normalized;
}

function directionsOverlap(
  left: PaymentMethodFieldDefinition["direction"],
  right: PaymentMethodFieldDefinition["direction"],
): boolean {
  const directions = (direction: PaymentMethodFieldDefinition["direction"]) =>
    direction === "send" ? ["send"] : direction === "receive" ? ["receive"] : ["send", "receive"];
  return directions(left).some((direction) => directions(right).includes(direction));
}

function normalizedDirection(direction: PaymentMethodFieldDefinition["direction"]): "send" | "receive" | "both" {
  return direction ?? "both";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

const PAYMENT_METHOD_FIELDS_REVIEW_TTL_MS = 10 * 60 * 1000;

type PaymentMethodFieldsReviewPayload = {
  v: 1;
  expiresAt: number;
  methodIds: string[];
  fieldsHash: string;
  expectedUpdatedAtById: Record<string, string>;
  changeExistingDirectionKeys?: string[];
  fieldDefinitionsHashById?: Record<string, string>;
};

function paymentMethodFieldsReviewSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new ApiError(
      "PAYMENT_METHOD_BULK_FIELDS_NOT_CONFIGURED",
      "Payment-method bulk review signing is not configured.",
      503,
    );
  }
  return value;
}

function fieldsReviewSignature(encoded: string): string {
  return createHmac("sha256", paymentMethodFieldsReviewSecret())
    .update(`payment-method-bulk-fields:${encoded}`)
    .digest("base64url");
}

function canonicalReviewVersions(versions: Record<string, string | Date>): Record<string, string> {
  return Object.fromEntries(Object.keys(versions).sort().map((id) => [
    id,
    versions[id] instanceof Date ? versions[id]!.toISOString() : versions[id]!,
  ]));
}

function canonicalReviewIds(methodIds: string[]): string[] {
  return [...methodIds].sort();
}

function reviewFieldsHash(fields: PaymentMethodFieldDefinition[]): string {
  return createHash("sha256").update(stableJson(fields)).digest("base64url");
}

export function paymentMethodFieldDefinitionsHash(fields: PaymentMethodFieldDefinition[]): string {
  return createHash("sha256").update(stableJson(fields)).digest("base64url");
}

export function signPaymentMethodBulkFieldsReview(
  methodIds: string[],
  fields: PaymentMethodFieldDefinition[],
  expectedUpdatedAtById: Record<string, string | Date>,
  now = Date.now(),
  changeExistingDirectionKeys: string[] = [],
  fieldDefinitionsHashById?: Record<string, string>,
): string {
  const payload: PaymentMethodFieldsReviewPayload = {
    v: 1,
    expiresAt: now + PAYMENT_METHOD_FIELDS_REVIEW_TTL_MS,
    methodIds: canonicalReviewIds(methodIds),
    fieldsHash: reviewFieldsHash(fields),
    expectedUpdatedAtById: canonicalReviewVersions(expectedUpdatedAtById),
    changeExistingDirectionKeys: [...changeExistingDirectionKeys].sort(),
    ...(fieldDefinitionsHashById
      ? { fieldDefinitionsHashById: Object.fromEntries(Object.keys(fieldDefinitionsHashById).sort()
        .map((id) => [id, fieldDefinitionsHashById[id]!])) }
      : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${fieldsReviewSignature(encoded)}`;
}

export function verifyPaymentMethodBulkFieldsReview(
  token: string,
  methodIds: string[],
  fields: PaymentMethodFieldDefinition[],
  expectedUpdatedAtById: Record<string, string | Date>,
  now = Date.now(),
  changeExistingDirectionKeys: string[] = [],
  fieldDefinitionsHashById?: Record<string, string>,
): boolean {
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return false;
  const calculated = fieldsReviewSignature(encoded);
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  const calculatedBuffer = Buffer.from(calculated, "utf8");
  if (
    suppliedBuffer.length !== calculatedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, calculatedBuffer)
  ) return false;

  let payload: PaymentMethodFieldsReviewPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PaymentMethodFieldsReviewPayload;
  } catch {
    return false;
  }
  if (
    payload.v !== 1 ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= now ||
    !Array.isArray(payload.methodIds) ||
    typeof payload.fieldsHash !== "string" ||
    !payload.expectedUpdatedAtById ||
    typeof payload.expectedUpdatedAtById !== "object" ||
    Array.isArray(payload.expectedUpdatedAtById) ||
    (payload.fieldDefinitionsHashById !== undefined &&
      (!payload.fieldDefinitionsHashById ||
        typeof payload.fieldDefinitionsHashById !== "object" ||
        Array.isArray(payload.fieldDefinitionsHashById)))
  ) return false;
  return stableJson(payload.methodIds) === stableJson(canonicalReviewIds(methodIds)) &&
    payload.fieldsHash === reviewFieldsHash(fields) &&
    stableJson(payload.expectedUpdatedAtById) === stableJson(canonicalReviewVersions(expectedUpdatedAtById)) &&
    stableJson(payload.changeExistingDirectionKeys ?? []) === stableJson([...changeExistingDirectionKeys].sort()) &&
    (fieldDefinitionsHashById === undefined ||
      stableJson(payload.fieldDefinitionsHashById) === stableJson(Object.fromEntries(
        Object.keys(fieldDefinitionsHashById).sort().map((id) => [id, fieldDefinitionsHashById[id]!]),
      )));
}

type PaymentMethodDeleteFieldsReviewPayload = {
  v: 2;
  expiresAt: number;
  methodIds: string[];
  fieldKeys: string[];
  expectedUpdatedAtById: Record<string, string>;
  fieldDefinitionsHashById: Record<string, string>;
};

function deleteFieldsReviewSignature(encoded: string): string {
  return createHmac("sha256", paymentMethodFieldsReviewSecret())
    .update(`payment-method-bulk-delete-fields:${encoded}`)
    .digest("base64url");
}

export function signPaymentMethodBulkDeleteFieldsReview(
  methodIds: string[],
  fieldKeys: string[],
  versions: Record<string, string | Date>,
  fieldDefinitionsHashById: Record<string, string>,
  now = Date.now(),
): string {
  const payload: PaymentMethodDeleteFieldsReviewPayload = {
    v: 2,
    expiresAt: now + PAYMENT_METHOD_FIELDS_REVIEW_TTL_MS,
    methodIds: canonicalReviewIds(methodIds),
    fieldKeys: [...fieldKeys].sort(),
    expectedUpdatedAtById: canonicalReviewVersions(versions),
    fieldDefinitionsHashById: Object.fromEntries(Object.keys(fieldDefinitionsHashById).sort()
      .map(id => [id, fieldDefinitionsHashById[id]!])),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${deleteFieldsReviewSignature(encoded)}`;
}

export function verifyPaymentMethodBulkDeleteFieldsReview(
  token: string,
  methodIds: string[],
  fieldKeys: string[],
  versions: Record<string, string | Date>,
  hashes?: Record<string, string>,
  now = Date.now(),
): boolean {
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return false;
  const expected = Buffer.from(deleteFieldsReviewSignature(encoded), "utf8");
  const actual = Buffer.from(supplied, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  let payload: PaymentMethodDeleteFieldsReviewPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PaymentMethodDeleteFieldsReviewPayload;
  } catch {
    return false;
  }
  return payload?.v === 2 && typeof payload.expiresAt === "number" && payload.expiresAt > now &&
    Array.isArray(payload.methodIds) && Array.isArray(payload.fieldKeys) &&
    payload.expectedUpdatedAtById !== null && typeof payload.expectedUpdatedAtById === "object" &&
    !Array.isArray(payload.expectedUpdatedAtById) &&
    payload.fieldDefinitionsHashById !== null && typeof payload.fieldDefinitionsHashById === "object" &&
    !Array.isArray(payload.fieldDefinitionsHashById) &&
    stableJson(payload.methodIds) === stableJson(canonicalReviewIds(methodIds)) &&
    stableJson(payload.fieldKeys) === stableJson([...fieldKeys].sort()) &&
    stableJson(payload.expectedUpdatedAtById) === stableJson(canonicalReviewVersions(versions)) &&
    (hashes === undefined || stableJson(payload.fieldDefinitionsHashById) === stableJson(
      Object.fromEntries(Object.keys(hashes).sort().map(id => [id, hashes[id]!])),
    ));
}

/**
 * Merges selected field definitions into a method without replacing unselected
 * definitions or metadata stored by older/newer server versions.
 */
export function mergePaymentMethodFieldDefinitions(
  current: PaymentMethodFieldDefinition[],
  selected: PaymentMethodFieldDefinition[],
  changeExistingDirectionKeys: string[] = [],
): PaymentMethodFieldMergeSummary {
  const selectedIdentities = new Set<string>();
  for (const field of selected) {
    const identity = normalizedFieldIdentity(field.label);
    if (selectedIdentities.has(identity)) {
      throw new ApiError(
        "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY",
        `Selected fields contain multiple aliases for ${field.label}. Select only one field for each semantic identity.`,
        409,
      );
    }
    selectedIdentities.add(identity);
  }

  const definitions = current.map((field) => ({ ...field } as PaymentMethodFieldDefinition));
  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];
  const directionMismatches = new Set<string>();
  const matched = new Set<number>();
  const selectedMatches: Array<{
    sourceIndex: number;
    field: PaymentMethodFieldDefinition;
    submittedCondition: boolean;
  }> = [];
  const additions: PaymentMethodFieldDefinition[] = [];
  const keyAliases = new Map<string, string[]>();
  const overrideKeys = new Set(changeExistingDirectionKeys);

  for (const field of selected) {
    const identity = normalizedFieldIdentity(field.label);
    const exactKeyIndexes = current.flatMap((existing, index) =>
      !matched.has(index) && existing.key === field.key ? [index] : []);
    const exactLabelIndexes = current.flatMap((existing, index) =>
      !matched.has(index) && normalizedFieldLabel(existing.label) === normalizedFieldLabel(field.label)
        ? [index] : []);
    if (exactKeyIndexes.length > 1) {
      throw new ApiError(
        "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY",
        `Field key ${field.key} is duplicated on this payment method.`,
        409,
      );
    }
    const seedIndex = exactKeyIndexes[0] ?? exactLabelIndexes[0];
    let groupIndexes: number[];
    if (seedIndex !== undefined) {
      const normalizedSeedLabel = normalizedFieldLabel(current[seedIndex]!.label);
      groupIndexes = current.flatMap((existing, index) =>
        !matched.has(index) && normalizedFieldLabel(existing.label) === normalizedSeedLabel ? [index] : []);
    } else {
      const aliasIndexes = current.flatMap((existing, index) =>
        !matched.has(index) && normalizedFieldIdentity(existing.label) === identity ? [index] : []);
      const aliasLabels = new Set(aliasIndexes.map((index) => normalizedFieldLabel(current[index]!.label)));
      if (aliasLabels.size > 1) {
        throw new ApiError(
          "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY",
          `${field.label} ambiguously matches multiple existing payment-method fields.`,
          409,
        );
      }
      groupIndexes = aliasIndexes;
    }
    if (seedIndex === undefined) {
      if (!groupIndexes.length) {
        additions.push({ ...field });
        added.push(field.key);
        continue;
      }
    }
    for (const index of groupIndexes) {
      matched.add(index);
      const previous = current[index]!;
      if (
        field.direction !== undefined &&
        normalizedDirection(previous.direction) !== normalizedDirection(field.direction)
      ) directionMismatches.add(previous.key);
      const key = previous.key;
      const aliases = keyAliases.get(field.key) ?? [];
      if (!aliases.includes(key)) aliases.push(key);
      keyAliases.set(field.key, aliases);
      const merged = {
        ...previous,
        ...field,
        key,
        direction: overrideKeys.has(field.key) ? field.direction : previous.direction,
      } as PaymentMethodFieldDefinition;
      if (Object.prototype.hasOwnProperty.call(previous, "hidden")) {
        (merged as PaymentMethodFieldDefinition & { hidden?: unknown }).hidden =
          (previous as PaymentMethodFieldDefinition & { hidden?: unknown }).hidden;
      }
      if (!overrideKeys.has(field.key) && !Object.prototype.hasOwnProperty.call(previous, "direction")) {
        delete (merged as PaymentMethodFieldDefinition & { direction?: "send" | "receive" | "both" }).direction;
      }
      selectedMatches.push({
        sourceIndex: index,
        field: merged,
        submittedCondition: Object.prototype.hasOwnProperty.call(field, "requiredWhen"),
      });
    }
  }

  // Keep the original slots occupied by selected fields, but place those
  // selected fields in the submitted order. Unselected fields retain their
  // relative order and original slots.
  const selectedSlots = selectedMatches.map((match) => match.sourceIndex).sort((a, b) => a - b);
  const rewriteConditionalFieldAlias = (field: PaymentMethodFieldDefinition) => {
    const raw = field as PaymentMethodFieldDefinition & {
      requiredWhen?: { fieldKey: string; equals: string | string[] };
    };
    const mappedKeys = raw.requiredWhen ? keyAliases.get(raw.requiredWhen.fieldKey) : undefined;
    if (raw.requiredWhen && mappedKeys?.length) {
      const selectedField = selected.find(({ key }) => key === raw.requiredWhen!.fieldKey);
      const storedKey = selectedField && mappedKeys.includes(selectedField.key)
        ? selectedField.key
        : mappedKeys.length === 1
          ? mappedKeys[0]!
          : undefined;
      if (!storedKey) {
        throw new ApiError(
          "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY",
          `Conditional field reference ${raw.requiredWhen.fieldKey} maps to multiple stored fields.`,
          409,
        );
      }
      raw.requiredWhen = {
        ...raw.requiredWhen,
        fieldKey: storedKey,
      };
    }
  };
  selectedMatches.forEach(({ field, submittedCondition }, selectedIndex) => {
    const targetIndex = selectedSlots[selectedIndex]!;
    // A preserved condition belongs to the stored field; only rewrite a
    // condition explicitly submitted with this bulk edit.
    if (submittedCondition) rewriteConditionalFieldAlias(field);
    const source = current[selectedMatches[selectedIndex]!.sourceIndex]!;
    if (
      stableJson(source) === stableJson(field) &&
      selectedMatches[selectedIndex]!.sourceIndex === targetIndex
    ) unchanged.push(field.key);
    else modified.push(field.key);
    definitions[targetIndex] = field;
  });
  additions.forEach(rewriteConditionalFieldAlias);
  definitions.push(...additions);

  for (let index = 0; index < definitions.length; index++) {
    const field = definitions[index]!;
    for (let candidateIndex = 0; candidateIndex < index; candidateIndex++) {
      const candidate = definitions[candidateIndex]!;
      if (
        normalizedFieldLabel(candidate.label) === normalizedFieldLabel(field.label) &&
        directionsOverlap(candidate.direction, field.direction)
      ) {
        throw new ApiError(
          "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY",
          `Fields “${candidate.label}” and “${field.label}” identify the same field in overlapping directions. Use one field per normalized label and direction.`,
          409,
        );
      }
    }
  }

  return {
    fieldDefinitions: definitions,
    added,
    modified,
    unchanged,
    directionMismatches: [...directionMismatches],
  };
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
         fields: method.fieldDefinitions.filter((field) => field.enabled !== false),
      }];
    },
  );
}