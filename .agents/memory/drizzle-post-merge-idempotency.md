---
name: Drizzle post-merge idempotency
description: Why tracked table-creation migrations must tolerate tables already created by schema reconciliation.
---

Make new-table migrations safe to run when the target tables already exist with the expected schema, and cover that state in migration tests.

**Why:** Post-merge schema reconciliation can create new tables before the runtime migrator records the corresponding migration. A plain `CREATE TABLE` then aborts API startup even though the database schema is already correct.

**How to apply:** Use idempotent creation for additive tables and test migration from a schema where those tables exist but the migration-history row does not. Never drop or recreate existing tables just to repair history.