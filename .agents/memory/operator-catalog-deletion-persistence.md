---
name: Operator catalog deletion persistence
description: Preventing publish or process restarts from restoring currencies, payment methods, and assets deleted by operators.
---

Catalog defaults belong in one-time database migrations. Runtime list, configuration, and Admin routes must remain read-only unless the request explicitly performs an operator mutation; they must never insert missing static catalog rows.

**Why:** Request-time “ensure seed” functions treated row absence as an uninitialized database. After an operator deleted a currency, payment method, attachment, pricing rule, crypto asset, or network, the next API process restart and list request recreated it from static defaults. A shared-database test setup also removed non-default currencies without restoring operator state.

**How to apply:** Add future catalog defaults through a new additive migration. Never restore missing rows from static catalogs during startup or reads. Tests may create and remove only uniquely identified fixtures, and must preserve all unrelated operator configuration. During Publish, keep production data overwrite disabled unless the user explicitly requests and reviews a replacement.