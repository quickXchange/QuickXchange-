import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { customerStatusAllowsApi } from "../src/lib/customer-auth";
import {
  configureCustomerManagementClerkForTests,
  customerProfileUpdatePayload,
  updateCustomerIdentityProfile,
} from "../src/routes/customer-management";

test("suspended identities are rejected by the shared customer API guard", () => {
  assert.equal(customerStatusAllowsApi("active"), true);
  assert.equal(customerStatusAllowsApi(undefined), true);
  assert.equal(customerStatusAllowsApi("suspended"), false);
});

test("linked profile synchronization sends Clerk only supported name fields", async () => {
  let received: unknown;
  configureCustomerManagementClerkForTests({
    updateProfile: async (_id, data) => { received = data; },
  });
  await updateCustomerIdentityProfile("user_1", { firstName: "Ada", lastName: "Lovelace" });
  assert.deepEqual(received, { firstName: "Ada", lastName: "Lovelace" });
  assert.deepEqual(customerProfileUpdatePayload({ firstName: "Ada" }), { firstName: "Ada" });
  const source = await readFile(resolve(process.cwd(), "src/routes/customer-management.ts"), "utf8");
  assert.doesNotMatch(source.match(/action: "customer\.updated"[\s\S]{0,300}/)?.[0] ?? "", /temporaryPassword/);
});

test("customer aggregate queries preserve affiliate accounting and per-asset semantics", async () => {
  const source = await readFile(resolve(process.cwd(), "src/routes/customer-management.ts"), "utf8");
  const aggregateSection = source.slice(source.indexOf("const aggregateRows"), source.indexOf("const balance"));
  assert.match(aggregateSection, /affiliateCommissionsTable\.affiliateAccountId, affiliate\.id/);
  assert.match(aggregateSection, /affiliateCommissionsTable\.kind} = 'commission'/);
  assert.match(source, /groupBy\(ordersTable\.fromAsset\)/);
  assert.match(source, /groupBy\(ordersTable\.toAsset\)/);
});

test("every signed-in order creation route invokes the shared suspension guard", async () => {
  const [exchange, quickex] = await Promise.all([
    readFile(resolve(process.cwd(), "src/routes/exchange.ts"), "utf8"),
    readFile(resolve(process.cwd(), "src/routes/quickex.ts"), "utf8"),
  ]);
  const resolver = exchange.match(/async function resolveCustomerOrderIdentity[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.match(resolver, /await requireActiveCustomerIdentity\(customerClerkUserId, verifiedEmail\)/);
  assert.match(quickex, /await requireActiveCustomerIdentity\(customerClerkUserId, verifiedCustomerEmail\)/);
});