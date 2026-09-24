---
name: Signed crypto route identity
description: How signed Manual Swap snapshots cross customer-facing network labels and canonical monitoring identifiers.
---

Resolve the signed crypto settlement option by its immutable asset-network route ID first, then derive the canonical network code from the current locked route for readiness and watch registration. Never use a customer-facing network label as the monitor lookup key.

**Why:** A valid BTC quote can carry the display label `Bitcoin` or a provider-facing code `BITCOIN` while the monitoring network is keyed by canonical code `BTC`. Treating any of these as interchangeable rejects an otherwise ready order or leaves it without an active watch.

**How to apply:** At order-time revalidation and delayed watch reconciliation, use the signed route ID as the sole lookup key, derive its canonical network code, and resolve the exact enabled monitor network and asset in one transaction. When validating a provider-returned address, bind the request to the order's selected asset and provider-facing network, but validate address syntax against the signed route; do not require raw equality between provider-facing and catalog network codes. Revalidate configuration before inserting the watch; distinguish missing, disabled, proof-missing, and identity-mismatch states explicitly.