---
name: Order-directory indexing
description: How to add performance indexes for the operator order directory without blocking exchange writes.
---

Do not add regular `CREATE INDEX` statements for the orders directory to the standard Drizzle migration path on a populated production table. Use an online/concurrent index operation outside the transactional migrator when production query volume justifies it. After an operational index is built and verified, reconcile Drizzle with a metadata-only migration so later schema generation does not emit the same index as transactional DDL.

**Why:** PostgreSQL's regular index build can block writes, while `CREATE INDEX CONCURRENTLY` cannot run inside the normal transactional migration flow. A schema declaration without a reconciled snapshot can also cause a later, unrelated generation to reintroduce unsafe index DDL. The current directory remains functionally correct without the optional indexes.

**How to apply:** Measure the protected order-directory queries first. If created-time or status filtering becomes slow, schedule a separate online index operation with deployment-aware verification. Only then add the schema declaration and metadata-only snapshot reconciliation, with a populated-table migration test proving that the transactional path does not create the operational index.