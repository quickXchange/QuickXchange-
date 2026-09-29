import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";

let apiUrl = "";
let closeApi: (() => Promise<void>) | undefined;
let database: typeof import("@workspace/db");
let operatorId = "";
let operatorUserId = "";
let methodIds: string[] = [];
let orderingMethodId = "";
let conditionalMethodId = "";
let directionMethodIds: string[] = [];
let overrideMethodId = "";
let conditionalAliasMethodId = "";
let sameTimestampMethodId = "";
const verifiedEmails = new Map<string, string>();

async function request(path: string, body: unknown, userId = operatorUserId) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-test-clerk-user-id": userId } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json() as Record<string, unknown>,
  };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.SESSION_SECRET = "payment-method-bulk-fields-test-secret";
  database = await import("@workspace/db");
  const operatorAuth = await import("../src/lib/operator-auth");
  operatorAuth.configureOperatorAuthorizationForTests({
    getUserId: (req) => req.get("x-test-clerk-user-id") ?? null,
    getVerifiedEmail: (userId) => verifiedEmails.get(userId) ?? null,
  });

  const suffix = randomUUID().replaceAll("-", "");
  operatorUserId = `bulk-fields-${suffix}`;
  const email = `${operatorUserId}@example.test`;
  verifiedEmails.set(operatorUserId, email);
  const [operator] = await database.db.insert(database.operatorsTable).values({
    clerkUserId: operatorUserId,
    email,
    role: "operator",
    status: "active",
    permissionAllows: ["payment_methods.manage"],
  }).returning();
  operatorId = operator.id;

  const firstId = `bulk-fields-${suffix}-one`;
  const secondId = `bulk-fields-${suffix}-two`;
  methodIds = [firstId, secondId];
  await database.db.insert(database.paymentMethodsTable).values(methodIds.map((id, index) => ({
    id,
    name: `Bulk field test ${index + 1}`,
    fieldDefinitions: [{
      key: "account_name",
      type: "account-name",
      label: "Account name",
      help: "Keep this help",
      legacyMetadata: { keep: true },
    }],
  } as never)));
  orderingMethodId = `bulk-fields-${suffix}-order`;
  await database.db.insert(database.paymentMethodsTable).values({
    id: orderingMethodId,
    name: "Bulk field ordering test",
    fieldDefinitions: [
      { key: "unselected_a", type: "short-text", label: "Unselected A" },
      { key: "selected_b", type: "short-text", label: "Selected B" },
      { key: "unselected_c", type: "short-text", label: "Unselected C" },
      { key: "selected_d", type: "short-text", label: "Selected D" },
    ],
  } as never);
  conditionalMethodId = `bulk-fields-${suffix}-conditional`;
  await database.db.insert(database.paymentMethodsTable).values({
    id: conditionalMethodId,
    name: "Bulk field conditional alias test",
    fieldDefinitions: [{
      key: "legacy_choice",
      type: "select",
      label: "Payment type",
      options: [{ value: "bank", label: "Bank" }],
    }],
  } as never);
  directionMethodIds = [`bulk-fields-${suffix}-directions-one`, `bulk-fields-${suffix}-directions-two`];
  await database.db.insert(database.paymentMethodsTable).values([
    {
      id: directionMethodIds[0],
      name: "Bulk field direction target one",
      fieldDefinitions: [
        { key: "stored_name_one", type: "short-text", label: "Name", direction: "send", hidden: true },
        { key: "stored_iban_one", type: "short-text", label: "IBAN", direction: "receive" },
        { key: "stored_description_one", type: "short-text", label: "Payment Description" },
        { key: "stored_reference_one", type: "account-number", label: "Payment Reference", direction: "both" },
        { key: "unrelated_one", type: "short-text", label: "Unrelated" },
      ],
    },
    {
      id: directionMethodIds[1],
      name: "Bulk field direction target two",
      fieldDefinitions: [
        { key: "stored_name_two", type: "short-text", label: "Account Name", direction: "receive" },
        { key: "stored_iban_two", type: "short-text", label: "Account IBAN", direction: "send" },
        { key: "stored_reference_two", type: "short-text", label: "Reference", direction: "both" },
        { key: "unrelated_two", type: "short-text", label: "Unrelated" },
      ],
    },
  ] as never);
  overrideMethodId = `bulk-fields-${suffix}-direction-override`;
  await database.db.insert(database.paymentMethodsTable).values({
    id: overrideMethodId,
    name: "Bulk field explicit direction override",
    fieldDefinitions: [{ key: "override_name", type: "short-text", label: "Name", direction: "receive" }],
  } as never);
  conditionalAliasMethodId = `bulk-fields-${suffix}-conditional-alias-ambiguity`;
  await database.db.insert(database.paymentMethodsTable).values({
    id: conditionalAliasMethodId,
    name: "Bulk field conditional alias ambiguity",
    fieldDefinitions: [
      { key: "alias_send", type: "short-text", label: "Name", direction: "send" },
      { key: "alias_receive", type: "short-text", label: "Name", direction: "receive" },
      {
        key: "stored_guard",
        type: "short-text",
        label: "Stored guard",
        requiredWhen: { fieldKey: "alias_receive", equals: "yes" },
      },
    ],
  } as never);
  sameTimestampMethodId = `bulk-fields-${suffix}-same-timestamp`;
  await database.db.insert(database.paymentMethodsTable).values({
    id: sameTimestampMethodId,
    name: "Bulk field same timestamp safety",
    fieldDefinitions: [{ key: "legacy_name", type: "short-text", label: "Name" }],
  } as never);

  const { default: app } = await import("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api`;
  closeApi = () => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

after(async () => {
  if (closeApi) await closeApi();
  if (methodIds.length || orderingMethodId) {
    await database.db.delete(database.paymentMethodsTable)
      .where(inArray(database.paymentMethodsTable.id, [
        ...methodIds,
        orderingMethodId,
        conditionalMethodId,
        ...directionMethodIds,
        overrideMethodId,
        conditionalAliasMethodId,
        sameTimestampMethodId,
      ]));
  }
  if (operatorId) {
    await database.db.delete(database.operatorsTable)
      .where(eq(database.operatorsTable.id, operatorId));
  }
});

test("bulk payment-method field API applies selected ordering within selected slots", { concurrency: false }, async () => {
  const fields = [
    { key: "selected_d", type: "short-text", label: "Selected D" },
    { key: "selected_b", type: "short-text", label: "Selected B" },
  ];
  const preview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [orderingMethodId],
    fields,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const targets = preview.body.targets as Array<{ id: string; action: string; updatedAt: string }>;
  assert.equal(targets[0]?.action, "update");
  const applied = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds: [orderingMethodId],
    fields,
    expectedUpdatedAtById: { [orderingMethodId]: targets[0]!.updatedAt },
    reviewToken: preview.body.reviewToken,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.deepEqual(applied.body, { updated: 1, skipped: 0, failed: 0 });
  const [row] = await database.db.select().from(database.paymentMethodsTable)
    .where(eq(database.paymentMethodsTable.id, orderingMethodId));
  assert.deepEqual(row!.fieldDefinitions.map(({ key }) => key), [
    "unselected_a",
    "selected_d",
    "unselected_c",
    "selected_b",
  ]);
});

test("bulk field API rewrites conditional references when a selected legacy field retains its key", { concurrency: false }, async () => {
  const fields = [
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
  ];
  const preview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [conditionalMethodId],
    fields,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const targets = preview.body.targets as Array<{ updatedAt: string }>;
  const applied = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds: [conditionalMethodId],
    fields,
    expectedUpdatedAtById: { [conditionalMethodId]: targets[0]!.updatedAt },
    reviewToken: preview.body.reviewToken,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const [row] = await database.db.select().from(database.paymentMethodsTable)
    .where(eq(database.paymentMethodsTable.id, conditionalMethodId));
  assert.equal(row!.fieldDefinitions[0]!.key, "legacy_choice");
  assert.equal(row!.fieldDefinitions[1]!.requiredWhen?.fieldKey, "legacy_choice");
});

test("selected semantic aliases are rejected and conditional references prefer an exact stored key", { concurrency: false }, async () => {
  const duplicateAliases = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [conditionalAliasMethodId],
    fields: [
      { key: "name", type: "account-name", label: "Name" },
      { key: "account_name", type: "account-name", label: "Account Name" },
    ],
  });
  assert.equal(duplicateAliases.status, 409);

  const ambiguousCondition = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [conditionalAliasMethodId],
    fields: [
      { key: "account_name", type: "account-name", label: "Name" },
      {
        key: "new_guard",
        type: "short-text",
        label: "New guard",
        requiredWhen: { fieldKey: "account_name", equals: "yes" },
      },
    ],
  });
  assert.equal(ambiguousCondition.status, 409);

  const fields = [
    { key: "alias_send", type: "account-name", label: "Name", required: true },
    {
      key: "new_guard",
      type: "short-text",
      label: "New guard",
      requiredWhen: { fieldKey: "alias_send", equals: "yes" },
    },
  ];
  const preview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [conditionalAliasMethodId],
    fields,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const target = (preview.body.targets as Array<{ updatedAt: string }>)[0]!;
  const applied = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds: [conditionalAliasMethodId],
    fields,
    expectedUpdatedAtById: { [conditionalAliasMethodId]: target.updatedAt },
    reviewToken: preview.body.reviewToken,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const [row] = await database.db.select().from(database.paymentMethodsTable)
    .where(eq(database.paymentMethodsTable.id, conditionalAliasMethodId));
  assert.equal(row!.fieldDefinitions.find(({ key }) => key === "new_guard")!.requiredWhen?.fieldKey, "alias_send");
  assert.equal(row!.fieldDefinitions.find(({ key }) => key === "stored_guard")!.requiredWhen?.fieldKey, "alias_receive");
});

test("bulk fields match semantic aliases across methods and preserve each stored direction, key, and unrelated field", { concurrency: false }, async () => {
  const fields = [
    { key: "name", type: "account-name", label: "Name", direction: "send", required: true },
    { key: "iban", type: "account-iban", label: "IBAN", direction: "send", required: true },
    { key: "payment_description", type: "short-text", label: "Payment Description", direction: "send", required: true },
  ];
  const preview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: directionMethodIds,
    fields,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const targets = preview.body.targets as Array<{
    id: string;
    updatedAt: string;
    action: string;
    directionMismatches: string[];
  }>;
  assert.ok(targets.every((target) => target.action === "update" && target.directionMismatches.length > 0));
  const applied = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds: directionMethodIds,
    fields,
    expectedUpdatedAtById: Object.fromEntries(targets.map(({ id, updatedAt }) => [id, updatedAt])),
    reviewToken: preview.body.reviewToken,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const rows = await database.db.select().from(database.paymentMethodsTable)
    .where(inArray(database.paymentMethodsTable.id, directionMethodIds));
  for (const row of rows) {
    assert.equal(row.fieldDefinitions.length, row.id === directionMethodIds[0] ? 5 : 4);
    assert.deepEqual(row.fieldDefinitions.map(({ key }) => key), [
      row.id === directionMethodIds[0] ? "stored_name_one" : "stored_name_two",
      row.id === directionMethodIds[0] ? "stored_iban_one" : "stored_iban_two",
      row.id === directionMethodIds[0] ? "stored_description_one" : "stored_reference_two",
      ...(row.id === directionMethodIds[0] ? ["stored_reference_one"] : []),
      row.id === directionMethodIds[0] ? "unrelated_one" : "unrelated_two",
    ]);
    assert.equal(row.fieldDefinitions[0]!.direction, row.id === directionMethodIds[0] ? "send" : "receive");
    assert.equal(row.fieldDefinitions[1]!.direction, row.id === directionMethodIds[0] ? "receive" : "send");
    assert.equal(row.fieldDefinitions[2]!.direction, row.id === directionMethodIds[0] ? undefined : "both");
  }
  const first = rows.find(({ id }) => id === directionMethodIds[0])!;
  assert.equal((first.fieldDefinitions[0] as unknown as { hidden?: boolean }).hidden, true);
  assert.equal(first.fieldDefinitions[3]!.label, "Payment Reference");
  assert.equal(first.fieldDefinitions[3]!.type, "account-number");
  assert.equal(first.fieldDefinitions[3]!.required, undefined);
  assert.ok(rows.every((row) => row.fieldDefinitions.slice(0, 3).every(({ required }) => required === true)));
});

test("explicit direction changes are review-bound and safely applied", { concurrency: false }, async () => {
  const fields = [{ key: "account_name", type: "account-name", label: "Name", direction: "send" }];
  const invalidOverride = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [overrideMethodId],
    fields,
    changeExistingDirectionKeys: ["not-selected"],
  });
  assert.equal(invalidOverride.status, 409);
  const missingDirection = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [overrideMethodId],
    fields: [{ key: "account_name", type: "account-name", label: "Name" }],
    changeExistingDirectionKeys: ["account_name"],
  });
  assert.equal(missingDirection.status, 409);
  const preview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [overrideMethodId],
    fields,
    changeExistingDirectionKeys: ["account_name"],
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const target = (preview.body.targets as Array<{ updatedAt: string }>)[0]!;
  const tampered = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds: [overrideMethodId],
    fields,
    expectedUpdatedAtById: { [overrideMethodId]: target.updatedAt },
    reviewToken: preview.body.reviewToken,
  });
  assert.equal(tampered.status, 409);
  const applied = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds: [overrideMethodId],
    fields,
    changeExistingDirectionKeys: ["account_name"],
    expectedUpdatedAtById: { [overrideMethodId]: target.updatedAt },
    reviewToken: preview.body.reviewToken,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const [row] = await database.db.select().from(database.paymentMethodsTable)
    .where(eq(database.paymentMethodsTable.id, overrideMethodId));
  assert.equal(row!.fieldDefinitions[0]!.key, "override_name");
  assert.equal(row!.fieldDefinitions[0]!.direction, "send");
});

test("bulk payment-method fields preview and apply atomically reject stale reviewed versions", { concurrency: false }, async () => {
  const fields = [{
    key: "account_name",
    type: "account-name",
    label: "Account name",
    required: true,
  }];
  const preview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds,
    fields,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const targets = preview.body.targets as Array<{
    id: string;
    updatedAt: string;
    action: string;
    modified: string[];
  }>;
  assert.equal(targets.length, 2);
  assert.ok(targets.every((target) =>
    target.action === "update" &&
    target.modified.includes("account_name")));
  const reviewToken = preview.body.reviewToken as string;
  assert.ok(reviewToken);

  const directionConflict = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds,
    fields: [{ ...fields[0], direction: "send" }],
  });
  assert.equal(directionConflict.status, 200);

  const duplicateIdentity = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds,
    fields: [
      fields[0],
      {
        key: "account_name_extra",
        type: "short-text",
        label: "ACCOUNT-name!",
      },
    ],
  });
  assert.equal(duplicateIdentity.status, 409);

  const tamperedApply = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds,
    fields: [{ ...fields[0], required: false }],
    expectedUpdatedAtById: Object.fromEntries(targets.map((target) => [target.id, target.updatedAt])),
    reviewToken,
  });
  assert.equal(tamperedApply.status, 409);

  await database.db.update(database.paymentMethodsTable)
    .set({ description: "changed after review", updatedAt: new Date(Date.now() + 5_000) })
    .where(eq(database.paymentMethodsTable.id, methodIds[1]!));
  const staleApply = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds,
    fields,
    expectedUpdatedAtById: Object.fromEntries(targets.map((target) => [target.id, target.updatedAt])),
    reviewToken,
  });
  assert.equal(staleApply.status, 409);
  const unchangedFirst = await database.db.select().from(database.paymentMethodsTable)
    .where(eq(database.paymentMethodsTable.id, methodIds[0]!));
  assert.equal(unchangedFirst[0]!.fieldDefinitions[0]!.required, undefined);

  const freshPreview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds,
    fields,
  });
  assert.equal(freshPreview.status, 200);
  const freshTargets = freshPreview.body.targets as typeof targets;
  const applied = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds,
    fields,
    expectedUpdatedAtById: Object.fromEntries(
      freshTargets.map((target) => [target.id, target.updatedAt]),
    ),
    reviewToken: freshPreview.body.reviewToken,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.deepEqual(applied.body, { updated: 2, skipped: 0, failed: 0 });

  const updated = await database.db.select().from(database.paymentMethodsTable)
    .where(inArray(database.paymentMethodsTable.id, methodIds));
  assert.equal(updated.length, 2);
  assert.ok(updated.every((row) => row.fieldDefinitions[0]!.required === true));
  assert.ok(updated.every((row) =>
    (row.fieldDefinitions[0] as unknown as { legacyMetadata?: { keep?: boolean } })
      .legacyMetadata?.keep === true));
});

test("bulk field apply rejects same-timestamp field changes without overwriting them", { concurrency: false }, async () => {
  const fields = [{ key: "name", type: "account-name", label: "Name", required: true }];
  const preview = await request("/admin/payment-methods/bulk-fields/preview", {
    methodIds: [sameTimestampMethodId],
    fields,
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  const target = (preview.body.targets as Array<{ updatedAt: string }>)[0]!;
  const [before] = await database.db.select().from(database.paymentMethodsTable)
    .where(eq(database.paymentMethodsTable.id, sameTimestampMethodId));
  const concurrentlyChangedFields = [{
    key: "legacy_name",
    type: "short-text",
    label: "Name",
    operatorEdit: "must survive",
  }];
  await database.db.update(database.paymentMethodsTable)
    .set({ fieldDefinitions: concurrentlyChangedFields as never, updatedAt: before!.updatedAt })
    .where(eq(database.paymentMethodsTable.id, sameTimestampMethodId));
  const applied = await request("/admin/payment-methods/bulk-fields/apply", {
    methodIds: [sameTimestampMethodId],
    fields,
    expectedUpdatedAtById: { [sameTimestampMethodId]: target.updatedAt },
    reviewToken: preview.body.reviewToken,
  });
  assert.equal(applied.status, 409);
  const [after] = await database.db.select().from(database.paymentMethodsTable)
    .where(eq(database.paymentMethodsTable.id, sameTimestampMethodId));
  assert.equal((after!.fieldDefinitions[0] as unknown as { operatorEdit?: string }).operatorEdit, "must survive");
  assert.equal(after!.fieldDefinitions[0]!.required, undefined);
});

test("bulk field deletion uses keys, preserves unrelated definitions, and fences stale reviews", { concurrency: false }, async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const table = database.paymentMethodsTable;
  try {
    await database.db.insert(table).values([
      { id: ids[0], name: "Delete fields first", fieldDefinitions: [
        { key: "keep", label: "Keep", type: "short-text", options: undefined, legacyMetadata: { preserve: true } },
        { key: "iban_key", label: "IBAN", type: "account-iban", pattern: "^DE" },
        { key: "description_key", label: "Description", type: "long-text" },
      ] },
      { id: ids[1], name: "Delete fields second", fieldDefinitions: [
        { key: "keep", label: "Keep", type: "short-text", help: "Leave intact" },
        { key: "iban_key", label: "Bank account", type: "account-iban" },
      ] },
      { id: ids[2], name: "Delete fields unaffected", fieldDefinitions: [
        { key: "different_key", label: "IBAN", type: "short-text" },
      ] },
    ] as never);
    const path = "/admin/payment-methods/bulk-delete-fields";
    const selection = { methodIds: ids, fieldKeys: ["iban_key", "description_key"] };
    const unauthorized = await request(`${path}/preview`, selection, "");
    assert.notEqual(unauthorized.status, 200);
    const preview = await request(`${path}/preview`, selection);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.affectedMethods, 2);
    assert.equal(preview.body.removedFields, 3);
    const targets = preview.body.targets as { id: string; updatedAt: string; removed: string[] }[];
    assert.deepEqual(targets.find(target => target.id === ids[2])?.removed, []);
    const versions = Object.fromEntries(targets.map(target => [target.id, target.updatedAt]));
    const alteredSelection = await request(`${path}/apply`, {
      ...selection, fieldKeys: ["keep"], expectedUpdatedAtById: versions, reviewToken: preview.body.reviewToken,
    });
    assert.equal(alteredSelection.status, 409);
    const [before] = await database.db.select().from(table).where(eq(table.id, ids[0]));
    await database.db.update(table).set({
      updatedAt: before!.updatedAt,
      fieldDefinitions: [...before!.fieldDefinitions, { key: "concurrent", label: "Concurrent", type: "short-text" }] as never,
    }).where(eq(table.id, ids[0]));
    const stale = await request(`${path}/apply`, {
      ...selection, expectedUpdatedAtById: versions, reviewToken: preview.body.reviewToken,
    });
    assert.equal(stale.status, 409);
    const fresh = await request(`${path}/preview`, selection);
    assert.equal(fresh.status, 200);
    const reviewed = fresh.body.targets as { id: string; updatedAt: string }[];
    const applied = await request(`${path}/apply`, {
      ...selection,
      expectedUpdatedAtById: Object.fromEntries(reviewed.map(target => [target.id, target.updatedAt])),
      reviewToken: fresh.body.reviewToken,
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.affectedMethods, 2);
    assert.equal(applied.body.removedFields, 3);
    const remaining = await database.db.select().from(table).where(inArray(table.id, ids));
    const first = remaining.find(row => row.id === ids[0])!;
    assert.deepEqual(first.fieldDefinitions.map(field => field.key), ["keep", "concurrent"]);
    assert.deepEqual((first.fieldDefinitions[0] as unknown as { legacyMetadata: unknown }).legacyMetadata, { preserve: true });
    assert.deepEqual(remaining.find(row => row.id === ids[1])!.fieldDefinitions.map(field => field.key), ["keep"]);
    assert.deepEqual(remaining.find(row => row.id === ids[2])!.fieldDefinitions.map(field => field.key), ["different_key"]);
  } finally {
    await database.db.delete(table).where(inArray(table.id, ids));
  }
});

test("bulk field deletion refuses to orphan an unselected conditional field", { concurrency: false }, async () => {
  const id = randomUUID();
  const table = database.paymentMethodsTable;
  try {
    await database.db.insert(table).values({
      id,
      name: "Conditional delete target",
      fieldDefinitions: [
        { key: "choice", label: "Choice", type: "short-text" },
        { key: "conditional", label: "Conditional", type: "short-text",
          requiredWhen: { fieldKey: "choice", equals: "yes" } },
      ],
    } as never);
    const rejected = await request("/admin/payment-methods/bulk-delete-fields/preview", {
      methodIds: [id], fieldKeys: ["choice"],
    });
    assert.equal(rejected.status, 409);
    const [untouched] = await database.db.select().from(table).where(eq(table.id, id));
    assert.deepEqual(untouched!.fieldDefinitions.map(field => field.key), ["choice", "conditional"]);
    const accepted = await request("/admin/payment-methods/bulk-delete-fields/preview", {
      methodIds: [id], fieldKeys: ["choice", "conditional"],
    });
    assert.equal(accepted.status, 200);
  } finally {
    await database.db.delete(table).where(eq(table.id, id));
  }
});

test("bulk field deletion requires payment-method management permission", { concurrency: false }, async () => {
  const userId = `bulk-delete-viewer-${randomUUID()}`;
  const email = `${userId}@example.test`;
  verifiedEmails.set(userId, email);
  const [viewer] = await database.db.insert(database.operatorsTable).values({
    clerkUserId: userId, email, role: "operator", status: "active", permissionAllows: [],
  }).returning();
  try {
    for (const path of ["preview", "apply"]) {
      const denied = await request(`/admin/payment-methods/bulk-delete-fields/${path}`, {
        methodIds: [methodIds[0]], fieldKeys: ["account_name"],
      }, userId);
      assert.equal(denied.status, 403);
    }
  } finally {
    verifiedEmails.delete(userId);
    await database.db.delete(database.operatorsTable).where(eq(database.operatorsTable.id, viewer!.id));
  }
});