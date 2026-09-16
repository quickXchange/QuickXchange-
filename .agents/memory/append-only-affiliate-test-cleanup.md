---
name: Append-only affiliate test cleanup
description: How integration tests should clean up protected affiliate ledger fixtures.
---

Affiliate commission rows are protected by an append-only trigger, and the application database role cannot disable that trigger or change replication mode. Integration tests that seed these rows must use the privileged test pool for narrowly identified cleanup and restore triggers before committing.

**Why:** Normal Drizzle deletes fail by design, while the runtime database role also lacks permission for trigger or replication bypasses. Failed cleanup otherwise leaves financial test fixtures in the shared development database.

**How to apply:** Give fixtures an unambiguous test-only identity, clean stale matching fixtures before setup, disable only the relevant user trigger through the privileged test connection, delete in foreign-key order, re-enable the trigger, and clean again after the suite.