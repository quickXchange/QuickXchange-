import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePaymentMethodFieldDefinitions,
  signPaymentMethodBulkFieldsReview,
  validateSafeFieldDefinitions,
  verifyPaymentMethodBulkFieldsReview,
} from "../src/lib/payment-methods";
import type { PaymentMethodFieldDefinition } from "@workspace/db";
import { ApiError } from "../src/lib/api-error";

test("bulk field merge matches normalized labels in overlapping directions and keeps unknown metadata", () => {
  const existing = [{
    key: "legacy_bank",
    type: "short-text",
    label: "Bank account",
    direction: "send",
    help: "Existing help",
    futureMetadata: { retained: true },
  }] as unknown as PaymentMethodFieldDefinition[];
  const selected = [{
    key: "bank_details",
    type: "account-iban",
    label: "  BANK-account ",
    direction: "send",
    required: true,
  }] as PaymentMethodFieldDefinition[];

  const result = mergePaymentMethodFieldDefinitions(existing, selected);
  assert.deepEqual(result.modified, ["legacy_bank"]);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.unchanged, []);
  assert.equal(result.fieldDefinitions.length, 1);
  assert.deepEqual(result.fieldDefinitions[0], {
    key: "legacy_bank",
    type: "account-iban",
    label: "  BANK-account ",
    direction: "send",
    help: "Existing help",
    required: true,
    futureMetadata: { retained: true },
  });
  assert.doesNotThrow(() => validateSafeFieldDefinitions(result.fieldDefinitions));
});

test("bulk field merge adds a disjoint directional field without replacing the existing direction", () => {
  const existing = [{
    key: "receive_reference",
    type: "short-text",
    label: "Reference",
    direction: "receive",
  }] as PaymentMethodFieldDefinition[];
  const selected = [{
    key: "send_reference",
    type: "short-text",
    label: "Reference",
    direction: "send",
  }] as PaymentMethodFieldDefinition[];

  const result = mergePaymentMethodFieldDefinitions(existing, selected);
  assert.deepEqual(result.added, ["send_reference"]);
  assert.deepEqual(result.modified, []);
  assert.deepEqual(result.unchanged, []);
  assert.deepEqual(result.fieldDefinitions.map(({ key, direction }) => ({ key, direction })), [
    { key: "receive_reference", direction: "receive" },
    { key: "send_reference", direction: "send" },
  ]);
  assert.doesNotThrow(() => validateSafeFieldDefinitions(result.fieldDefinitions));
});

test("unchanged selected fields retain omitted optional metadata and are classified as unchanged", () => {
  const existing = [{
    key: "account_name",
    type: "account-name",
    label: "Account name",
    enabled: false,
    placeholder: "Name on account",
  }] as PaymentMethodFieldDefinition[];
  const selected = [{
    key: "account_name",
    type: "account-name",
    label: "Account name",
  }] as PaymentMethodFieldDefinition[];

  const result = mergePaymentMethodFieldDefinitions(existing, selected);
  assert.deepEqual(result.unchanged, ["account_name"]);
  assert.deepEqual(result.modified, []);
  assert.deepEqual(result.fieldDefinitions[0], existing[0]);
});

test("direction changes that would narrow or widen an existing field are rejected", () => {
  const existing = [{
    key: "bank_account",
    type: "short-text",
    label: "Bank account",
    direction: "both",
  }] as PaymentMethodFieldDefinition[];
  for (const direction of ["send", "receive"] as const) {
    assert.throws(() => mergePaymentMethodFieldDefinitions(existing, [{
      key: "bank_account",
      type: "short-text",
      label: "Bank account",
      direction,
    }]), (error: unknown) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.code === "PAYMENT_METHOD_BULK_FIELDS_DIRECTION_CONFLICT");
  }
});

test("overlapping normalized label identities are rejected after merge", () => {
  assert.throws(() => mergePaymentMethodFieldDefinitions([{
    key: "account_name",
    type: "account-name",
    label: "Account name",
  } as PaymentMethodFieldDefinition], [{
    key: "account_name",
    type: "account-name",
    label: "Account name",
  }, {
    key: "account_name_extra",
    type: "short-text",
    label: "ACCOUNT-name!",
  }] as PaymentMethodFieldDefinition[]), (error: unknown) =>
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY");
});

test("selected fields reorder within their slots while unselected fields keep relative order", () => {
  const current = [
    { key: "unselected_a", type: "short-text", label: "Unselected A" },
    { key: "selected_b", type: "short-text", label: "Selected B" },
    { key: "unselected_c", type: "short-text", label: "Unselected C" },
    { key: "selected_d", type: "short-text", label: "Selected D" },
  ] as PaymentMethodFieldDefinition[];
  const result = mergePaymentMethodFieldDefinitions(current, [
    { key: "selected_d", type: "short-text", label: "Selected D" },
    { key: "selected_b", type: "short-text", label: "Selected B" },
  ] as PaymentMethodFieldDefinition[]);
  assert.deepEqual(result.fieldDefinitions.map(({ key }) => key), [
    "unselected_a",
    "selected_d",
    "unselected_c",
    "selected_b",
  ]);
  assert.deepEqual(result.modified, ["selected_d", "selected_b"]);
  assert.deepEqual(result.unchanged, []);
});

test("new conditional fields rewrite legacy matched-key aliases and remain valid", () => {
  const current = [{
    key: "legacy_choice",
    type: "select",
    label: "Payment type",
    options: [{ value: "bank", label: "Bank" }],
  }] as PaymentMethodFieldDefinition[];
  const result = mergePaymentMethodFieldDefinitions(current, [
    {
      key: "payment_type",
      type: "select",
      label: "Payment type",
      options: [{ value: "bank", label: "Bank" }],
    },
    {
      key: "bank_identifier",
      type: "short-text",
      label: "Bank identifier",
      requiredWhen: { fieldKey: "payment_type", equals: "bank" },
    },
  ] as PaymentMethodFieldDefinition[]);

  assert.deepEqual(result.added, ["bank_identifier"]);
  assert.equal(result.fieldDefinitions[1]!.requiredWhen?.fieldKey, "legacy_choice");
  assert.doesNotThrow(() => validateSafeFieldDefinitions(result.fieldDefinitions));
});

test("review token binds canonical selection, fields, versions, and expiration", () => {
  process.env.SESSION_SECRET = "payment-method-fields-unit-test-secret";
  const fields = [{
    key: "account_name",
    type: "account-name",
    label: "Account name",
  }] as PaymentMethodFieldDefinition[];
  const versions = { method_b: "2026-01-01T00:00:00.000Z", method_a: "2026-01-02T00:00:00.000Z" };
  const token = signPaymentMethodBulkFieldsReview(
    ["method_b", "method_a"],
    fields,
    versions,
    1000,
  );
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    token,
    ["method_a", "method_b"],
    fields,
    versions,
    1001,
  ), true);
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    token,
    ["method_a", "method_b"],
    [{ ...fields[0]!, required: true }] as PaymentMethodFieldDefinition[],
    versions,
    1001,
  ), false);
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    token,
    ["method_a", "method_b"],
    fields,
    versions,
    1000 + 10 * 60 * 1000,
  ), false);
});