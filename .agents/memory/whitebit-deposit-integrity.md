---
name: WhiteBIT deposit integrity
description: Durable identity, ledger, order-funding, and reconciliation rules for WhiteBIT deposits.
---

Credit eligibility requires a stable WhiteBIT transaction or unique ID. When both appear over time, they are aliases for one deposit and must be locked and resolved together. Once credited, economic fields stay frozen; conflicting terminal replays are quarantined for review rather than changing history without a ledger adjustment.

**Why:** WhiteBIT webhook and history records can expose different identifier combinations, corrected amounts, and network-qualified tickers. Treating each representation independently can double-credit or desynchronize the immutable balance ledger from customer history.

**How to apply:** Normalize provider tickers separately from the base asset/network request contract, lock every stable alias in deterministic order, credit once per immutable deposit row, and reconcile each address from offset zero to its high-water identity without requesting beyond the provider’s 10,000-record window.

Manual Swap funding addresses use an order-scoped claim, not the customer deposit balance path. Persist the chosen funding source before the provider call, grant call ownership through a database claim-token compare-and-set, and freeze either the generated address or the exact snapshotted fallback as the order’s permanent assignment.

**Why:** Process-local locks do not protect autoscaled instances. A replay racing an irreversible address request can otherwise trigger a second call, expose a fallback address, or mark the order unresolved while a successful provider response is still in flight.

**How to apply:** Serialize order identity with a PostgreSQL advisory transaction lock, atomically move the unique claim from `claiming` to `calling`, let only that updater call WhiteBIT, and update the claim plus all order funding snapshots in one transaction. Before accepting a generated address, lock its normalized identity and reject reuse by another order; that order receives its immutable fallback instead.

When WhiteBIT is selected, provider unavailability or generation failure uses the exact fallback snapshotted into that order. Once exposed, neither a later provider recovery nor another generated address may replace it.

**Why:** WhiteBIT capability parsing can fail because of unrelated provider catalog inconsistencies. Treating that uncertainty as “provider disabled” exposes a manual wallet even though the operator selected WhiteBIT for the supported route.

**How to apply:** Distinguish explicit disablement, missing credentials, confirmed route mismatch, and capability uncertainty for audit detail, but keep order creation available when a valid exact-row fallback exists. Record WhiteBIT as the selected provider and `manual_fallback` as the address source.

WhiteBIT’s public asset catalog can mark an asset deposit-enabled while omitting its deposit-network list. Exclude only that asset; continue to reject malformed populated lists and require an exact advertised asset/network match.

**Why:** Invalidating the entire catalog for one internally inconsistent asset disables every healthy route, while inferring networks from unrelated fields could authorize an unsupported address request.

**How to apply:** Treat a missing deposit-network list as no executable capability for that asset, but fail the catalog closed when a provided list has the wrong type or invalid entries.

WhiteBIT's per-order `create-new-address` endpoint requires provider-granted permission and can reject a specific asset/network even when signed balance access and a generic permission probe succeed. Never replace a rejected unique address with WhiteBIT's reusable account deposit address.

**Why:** A reusable account address cannot safely identify concurrent or late order deposits. WhiteBIT documents unique-address access as unavailable by default, so a valid API key alone does not prove an order route can generate one.

**How to apply:** Keep an exact manual fallback for each selected WhiteBIT route, record definitive rejection as unavailable when no fallback was snapshotted, and show that state explicitly to the customer instead of leaving an empty deposit panel.

WhiteBIT webhook authentication may use dedicated webhook credentials when configured, otherwise it uses the same API key and HMAC secret as signed WhiteBIT API requests. The public ownership-verification key is separate and must never be treated as an HMAC secret.

**Why:** WhiteBIT sends `x-txc-apikey`, payload, and signature headers compatible with the account API credentials, while ownership verification exposes a public key through a separate root endpoint. Requiring duplicate webhook-only secrets can silently disable valid callbacks.

**How to apply:** Prefer explicit webhook key/secret overrides, fall back to the configured WhiteBIT API key/secret, keep `/whiteBIT-verification` at the service root, and reject unsigned or malformed webhook requests before processing deposits.