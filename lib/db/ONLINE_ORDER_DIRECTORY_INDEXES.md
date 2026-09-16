# Online order-directory indexes

The order-directory sort indexes are operational database objects. They are
declared in the Drizzle schema and snapshot, but the standard migration is
metadata-only so it cannot run a blocking index build on a populated
`exchange_orders` table.

## One-off operation

Run this command only in an approved maintenance context whose `DATABASE_URL`
points at the intended database:

```sh
pnpm --filter @workspace/db run indexes:orders:online
```

The command:

1. refuses unsafe schema identifiers and a missing orders table;
2. verifies that any same-named index has the exact expected b-tree columns,
   key count, ordering, collation, and default operator classes;
3. creates missing indexes with `CREATE INDEX CONCURRENTLY`, outside a
   transaction;
4. rebuilds an incomplete same-definition concurrent index;
5. fails unless both indexes are ready and valid afterward.

Never add this command to application startup, an artifact build command, or
the transactional migration runner. For an existing populated database, run
and verify it before publishing the metadata reconciliation. A brand-new
production database can materialize the declared schema before accepting
traffic; verify both indexes after the first Publish.

The project currently has no deployment or production database. The operation
has been run and verified against development; first-Publish production
verification remains a release prerequisite.