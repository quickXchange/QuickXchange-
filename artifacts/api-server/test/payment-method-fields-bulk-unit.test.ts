import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePaymentMethodFieldDefinitions,
  paymentMethodFieldDefinitionsHash,
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

test("bulk field merge matches irrespective of direction and preserves the existing direction", () => {
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
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.modified, []);
  assert.deepEqual(result.unchanged, ["receive_reference"]);
  assert.deepEqual(result.fieldDefinitions.map(({ key, direction }) => ({ key, direction })), [
    { key: "receive_reference", direction: "receive" },
  ]);
  assert.deepEqual(result.directionMismatches, ["receive_reference"]);
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

test("existing directions are preserved by default and mismatches are reported", () => {
  const existing = [{
    key: "bank_account",
    type: "short-text",
    label: "Bank account",
    direction: "both",
  }] as PaymentMethodFieldDefinition[];
  const result = mergePaymentMethodFieldDefinitions(existing, [{
    key: "bank_account",
    type: "short-text",
    label: "Bank account",
    direction: "send",
  }]);
  assert.equal(result.fieldDefinitions[0]!.direction, "both");
  assert.deepEqual(result.directionMismatches, ["bank_account"]);
  const explicit = mergePaymentMethodFieldDefinitions(existing, [{
    key: "bank_account",
    type: "short-text",
    label: "Bank account",
    direction: "send",
  }], ["bank_account"]);
  assert.equal(explicit.fieldDefinitions[0]!.direction, "send");
});

test("same-identity send and receive rows both update with directions and keys retained", () => {
  const existing = [{
    key: "send_name",
    type: "short-text",
    label: "Name",
    direction: "send",
  }, {
    key: "receive_name",
    type: "short-text",
    label: "Name",
    direction: "receive",
  }] as PaymentMethodFieldDefinition[];
  const merged = mergePaymentMethodFieldDefinitions(existing, [{
    key: "account_name",
    type: "account-name",
    label: "Name",
    required: true,
  }] as PaymentMethodFieldDefinition[]);
  assert.deepEqual(merged.fieldDefinitions.map(({ key, direction, required }) => ({
    key,
    direction,
    required,
  })), [
    { key: "send_name", direction: "send", required: true },
    { key: "receive_name", direction: "receive", required: true },
  ]);
  assert.deepEqual(merged.added, []);
  assert.deepEqual(merged.directionMismatches, []);
  assert.throws(() => mergePaymentMethodFieldDefinitions(existing, [{
    key: "account_name",
    type: "account-name",
    label: "Name",
    direction: "send",
  }] as PaymentMethodFieldDefinition[], ["account_name"]), (error: unknown) =>
    error instanceof ApiError && error.code === "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY");
});

test("exact payment description match does not rewrite its existing payment reference alias", () => {
  const existing = [{
    key: "legacy_name",
    type: "short-text",
    label: "Name",
  }, {
    key: "legacy_iban",
    type: "short-text",
    label: "IBAN",
  }, {
    key: "legacy_description",
    type: "short-text",
    label: "Payment Description",
  }, {
    key: "legacy_reference",
    type: "account-number",
    label: "Payment Reference",
  }] as PaymentMethodFieldDefinition[];
  const merged = mergePaymentMethodFieldDefinitions(existing, [{
    key: "name",
    type: "account-name",
    label: "Name",
    required: true,
  }, {
    key: "iban",
    type: "account-iban",
    label: "IBAN",
    required: true,
  }, {
    key: "payment_description",
    type: "short-text",
    label: "Payment Description",
    required: true,
  }] as PaymentMethodFieldDefinition[]);
  assert.deepEqual(merged.fieldDefinitions.map(({ key }) => key), [
    "legacy_name",
    "legacy_iban",
    "legacy_description",
    "legacy_reference",
  ]);
  assert.deepEqual(merged.added, []);
  assert.equal(merged.fieldDefinitions[0]!.type, "account-name");
  assert.equal(merged.fieldDefinitions[1]!.type, "account-iban");
  assert.equal(merged.fieldDefinitions[2]!.required, true);
  assert.equal(merged.fieldDefinitions[3]!.label, "Payment Reference");
  assert.equal(merged.fieldDefinitions[3]!.type, "account-number");
  assert.equal(merged.fieldDefinitions[3]!.required, undefined);
});

test("selected semantic aliases fail before matching", () => {
  for (const [firstLabel, secondLabel] of [
    ["Name", "Account Name"],
    ["IBAN", "Account IBAN"],
    ["Payment Description", "Payment Reference"],
  ]) {
    assert.throws(() => mergePaymentMethodFieldDefinitions([], [{
      key: "first",
      type: "short-text",
      label: firstLabel!,
    }, {
      key: "second",
      type: "short-text",
      label: secondLabel!,
    }] as PaymentMethodFieldDefinition[]), (error: unknown) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.code === "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY");
  }
});

test("conditional aliases reject multiple stored keys, prefer exact selected keys, and retain stored conditions", () => {
  const current = [{
    key: "send_name",
    type: "short-text",
    label: "Name",
    direction: "send",
  }, {
    key: "receive_name",
    type: "short-text",
    label: "Name",
    direction: "receive",
  }, {
    key: "stored_dependent",
    type: "short-text",
    label: "Stored dependent",
    requiredWhen: { fieldKey: "receive_name", equals: "yes" },
  }] as PaymentMethodFieldDefinition[];
  assert.throws(() => mergePaymentMethodFieldDefinitions(current, [{
    key: "account_name",
    type: "account-name",
    label: "Name",
  }, {
    key: "new_dependent",
    type: "short-text",
    label: "New dependent",
    requiredWhen: { fieldKey: "account_name", equals: "yes" },
  }] as PaymentMethodFieldDefinition[]), (error: unknown) =>
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === "PAYMENT_METHOD_BULK_FIELDS_DUPLICATE_IDENTITY");

  const exactKeyMerge = mergePaymentMethodFieldDefinitions(current, [{
    key: "send_name",
    type: "account-name",
    label: "Name",
  }, {
    key: "new_dependent",
    type: "short-text",
    label: "New dependent",
    requiredWhen: { fieldKey: "send_name", equals: "yes" },
  }] as PaymentMethodFieldDefinition[]);
  assert.equal(exactKeyMerge.fieldDefinitions[3]!.requiredWhen?.fieldKey, "send_name");
  assert.equal(exactKeyMerge.fieldDefinitions[2]!.requiredWhen?.fieldKey, "receive_name");
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
  const withOverride = signPaymentMethodBulkFieldsReview(
    ["method_b", "method_a"],
    fields,
    versions,
    1000,
    ["account_name"],
  );
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    withOverride,
    ["method_a", "method_b"],
    fields,
    versions,
    1001,
    ["account_name"],
  ), true);
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    withOverride,
    ["method_a", "method_b"],
    fields,
    versions,
    1001,
  ), false);
  const fieldHashes = {
    method_a: paymentMethodFieldDefinitionsHash(fields),
    method_b: paymentMethodFieldDefinitionsHash([{ ...fields[0]!, required: true }] as PaymentMethodFieldDefinition[]),
  };
  const withFieldHashes = signPaymentMethodBulkFieldsReview(
    ["method_a", "method_b"],
    fields,
    versions,
    1000,
    [],
    fieldHashes,
  );
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    withFieldHashes,
    ["method_b", "method_a"],
    fields,
    versions,
    1001,
    [],
    fieldHashes,
  ), true);
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    withFieldHashes,
    ["method_b", "method_a"],
    fields,
    versions,
    1001,
    [],
    { ...fieldHashes, method_a: "changed-hash" },
  ), false);
  assert.equal(verifyPaymentMethodBulkFieldsReview(
    token,
    ["method_a", "method_b"],
    fields,
    versions,
    1000 + 10 * 60 * 1000,
  ), false);
});