---
name: Drizzle post-merge idempotency
description: Why tracked table-creation migrations must tolerate tables already created by schema reconciliation.
---

Make additive migrations safe to run when the target tables, columns, indexes, or constraints already exist with the expected schema, and cover that state in migration tests.

**Why:** Post-merge schema reconciliation can create new tables before the runtime migrator records the corresponding migration. A plain `CREATE TABLE` then aborts API startup even though the database schema is already correct.

**How to apply:** Use idempotent creation for additive tables and columns. Guard named constraints through the system catalogs when PostgreSQL has no `IF NOT EXISTS` form. Test migration from a correct schema whose migration-history row is absent. Never drop or recreate existing objects just to repair history.