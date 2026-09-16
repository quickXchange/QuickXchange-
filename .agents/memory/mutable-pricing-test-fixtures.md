---
name: Mutable configuration test fixtures
description: How API tests should handle operator-configurable rows originally created by migrations.
---

API tests that depend on migration-seeded operator configuration must snapshot its current development value, install an explicit test baseline when exact values matter, and restore the original value afterward. Never bulk-delete unrelated pricing rules or narrow a shared catalog to old seed values; delete only rows created by the test. When consuming current field definitions, populate required fields only; optional fields should remain omitted unless the test specifically covers them.

**Why:** The validation suite shares a mutable development database. Broad cleanup previously removed activated payment attachments and the live global fallback while leaving their data migration recorded, so normal migration reruns could not restore them. Operators can also legitimately edit seeded pricing rules and payment-field definitions. Optional fields may have constraints that intentionally reject arbitrary fixture values, so filling every advertised field makes unrelated tests nondeterministic.

**How to apply:** Treat operator-configurable rows as borrowed state: snapshot before mutation and restore in teardown, or isolate fixture selectors and clean up only captured IDs. Keep test catalog baselines aligned with every supported production seed. For dynamic forms, derive values from the current schema, omit optional fields, and use semantic values for typed required fields.