---
name: Signed crypto route identity
description: How signed Manual Swap snapshots cross customer-facing network labels and canonical monitoring identifiers.
---

Resolve the signed crypto settlement option by its immutable asset-network route ID first, then derive the canonical network code from the current locked route for readiness and watch registration. Never use a customer-facing network label as the monitor lookup key.

**Why:** A valid BTC quote can carry the display label `Bitcoin` while the monitoring network is keyed by canonical code `BTC`. Treating the label as the code rejects an otherwise ready order or leaves it without an active watch.

**How to apply:** At order-time revalidation and delayed watch reconciliation, prefer the signed route ID, verify the expected asset, and fail closed if that exact route cannot be resolved. Use label/code fallback only for legacy snapshots with no route ID.