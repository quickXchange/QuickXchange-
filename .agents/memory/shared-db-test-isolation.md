---
name: Shared database integration-test isolation
description: Safety rules for privileged integration tests that use the development database.
---

Privileged API integration tests use the shared development database unless explicitly isolated. They must never drop or truncate public application tables. Tests that mutate singleton provider settings or credentials belong in a fresh disposable database with synthetic fixtures, not in a shared database with a teardown snapshot.

**Why:** A test teardown removed migrated WhiteBIT tables while migration history still marked them applied, causing the next migration to fail and temporarily breaking the development schema. A separate test ran global customer-deposit reconciliation and deleted only its temporary rows, silently changing real catalog flags.

**How to apply:** Use unique fixture identifiers and delete only owned rows in foreign-key order. Before invoking global reconciliation or other whole-table state derivation, snapshot every pre-existing field it can change and restore those values in `finally`. Run destructive migration-upgrade scenarios on one connection inside a temporary schema and transaction, then roll back. Verify public tables and real catalog state remain unchanged after repeat runs.

Treat a proof fixture as an exact-route upsert, never as a replacement for the whole proof collection.

**Why:** A singleton proof-array fixture can remove a different route's real permission proof; even apparently careful after-test restoration is ineffective if the suite is interrupted or another test snapshots already contaminated state.

**How to apply:** Run the entire provider integration suite against a disposable database containing schema and synthetic data only; forbid live provider network calls, and compare shared Development state before and after. Keep route-scoped proof edits route-scoped inside the isolated suite.

Disposable database suites must create their own multi-route asset fixtures and use the suite's privileged cleanup path for protected financial rows.

**Why:** A cloned Development catalog may not contain every route a regression expects, and the ordinary runtime database role cannot delete protected WhiteBIT address records during test cleanup. Either assumption can make a valid isolated test fail or hide its original assertion.

**How to apply:** Give synthetic routes unique identities, clean up only their dependent records in foreign-key order with the privileged test connection where required, and preserve the primary assertion failure if cleanup also fails. Never loosen production privileges to make test teardown work.

When cloning the Development database for a broad integration suite, retain its PostgreSQL ACLs in the disposable copy. The application connects through a restricted runtime role even when the clone is created by the database owner.

**Why:** A full-data restore with `--no-acl` succeeds as the owner, but the test application then receives `permission denied` on ordinary tables; this is a test-clone defect, not an application permission regression.

**How to apply:** Preserve grants in the dump and restore, block real provider calls in the isolated test process, and drop only the disposable database after the suite.