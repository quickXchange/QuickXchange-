import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { customerOrderScope } from "../src/lib/customer-order-scope";
import { mergeOperatorOrderDirectory } from "../src/lib/order-history";

test("admin order scope isolates customers with similar names and emails by immutable ID", async () => {
  const customers = [
    { id: "cus-ada-1", name: "Ada Lovelace", email: "ada@example.test" },
    { id: "cus-ada-2", name: "Ada Lovelace", email: "ada+second@example.test" },
  ];
  const dialect = new PgDialect();
  const firstCustomerQuery = dialect.sqlToQuery(customerOrderScope(customers[0].id));
  const secondCustomerQuery = dialect.sqlToQuery(customerOrderScope(customers[1].id));

  assert.match(firstCustomerQuery.sql, /"exchange_orders"\."customer_id" = \$1/);
  assert.deepEqual(firstCustomerQuery.params, ["cus-ada-1"]);
  assert.deepEqual(secondCustomerQuery.params, ["cus-ada-2"]);
  assert.notDeepEqual(firstCustomerQuery.params, secondCustomerQuery.params);
  assert.doesNotMatch(firstCustomerQuery.sql, /customer_email|customer_name/);

  const [route, profileRoute] = await Promise.all([
    readFile(resolve(process.cwd(), "src/routes/exchange.ts"), "utf8"),
    readFile(resolve(process.cwd(), "src/routes/customer-management.ts"), "utf8"),
  ]);
  assert.match(route, /filters\.push\(customerOrderScope\(customer\.id\)\)/);
  assert.match(route, /if \(!customer\)[\s\S]{0,200}CUSTOMER_NOT_FOUND/);
  assert.match(profileRoute, /const orderWhere = customerOrderScope\(ctx\.customer\.id\)/);
  assert.equal((profileRoute.match(/\.where\(orderWhere\)/g) ?? []).length, 3);
});

test("ID-scoped results never append provider orders without a customer ID", async () => {
  const result = await mergeOperatorOrderDirectory(
    [{ id: "SWAP-ONE", createdAt: "2026-09-26T00:00:00.000Z" }],
    { customerId: "cus-ada-1", archived: "active", sortDirection: "desc", page: 1, pageSize: 20 },
  );
  assert.equal(result.total, 1);
  assert.deepEqual(result.items.map(item => item.id), ["SWAP-ONE"]);
});