---
name: Provider-sync write fencing
description: Concurrency rule for any worker or operator action that reconciles provider state into local orders.
---

Any provider-reconciliation order mutation must include the current provider-sync lease token and lease expiry as an atomic database predicate on the write. Lease renewal and a separate ownership check are not sufficient.

**Why:** A process can pause after checking or renewing a lease. Another worker can then acquire the expired lease, and the stale process would still mutate an order unless the write itself proves ownership.

**How to apply:** Renew leases during long provider reads and batches, but also condition every reconciliation-driven order update on the matching unexpired lease token. Classify lease loss as a conflict before provider-unavailable outcomes.