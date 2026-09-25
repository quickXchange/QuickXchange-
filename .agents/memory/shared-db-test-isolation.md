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