---
name: Shared database integration-test isolation
description: Safety rules for privileged integration tests that use the development database.
---

Privileged API integration tests use the shared development database unless a test explicitly creates and confines work to a temporary schema. They must never drop or truncate public application tables.

**Why:** A test teardown removed migrated WhiteBIT tables while migration history still marked them applied, causing the next migration to fail and temporarily breaking the development schema.

**How to apply:** Use unique fixture identifiers and delete only owned rows in foreign-key order. Run destructive migration-upgrade scenarios on one connection inside a temporary schema and transaction, then roll back. Verify public tables remain after repeat runs.