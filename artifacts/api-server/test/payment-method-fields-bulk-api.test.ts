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
      .where(inArray(database.paymentMethodsTable.id, [...methodIds, orderingMethodId, conditionalMethodId]));
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
  assert.equal(directionConflict.status, 409);

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