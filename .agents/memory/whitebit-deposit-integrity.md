---
name: WhiteBIT deposit integrity
description: Durable identity, ledger, order-funding, and reconciliation rules for WhiteBIT deposits.
---

Credit eligibility requires a stable WhiteBIT transaction or unique ID. When both appear over time, they are aliases for one deposit and must be locked and resolved together. Once credited, economic fields stay frozen; conflicting terminal replays are quarantined for review rather than changing history without a ledger adjustment.

**Why:** WhiteBIT webhook and history records can expose different identifier combinations, corrected amounts, and network-qualified tickers. Treating each representation independently can double-credit or desynchronize the immutable balance ledger from customer history.

**How to apply:** Normalize provider tickers separately from the base asset/network request contract, lock every stable alias in deterministic order, credit once per immutable deposit row, and reconcile each address from offset zero to its high-water identity without requesting beyond the provider’s 10,000-record window.

Manual Swap funding addresses use an order-scoped claim, not the customer deposit balance path. Persist the chosen funding source before the provider call, grant call ownership through a database claim-token compare-and-set, and never reveal the manual fallback after WhiteBIT was selected. Fresh in-flight claims remain provisioning; only claims older than the provider timeout become unresolved and eligible for explicit operator recovery.

**Why:** Process-local locks do not protect autoscaled instances. A replay racing an irreversible address request can otherwise trigger a second call, expose a fallback address, or mark the order unresolved while a successful provider response is still in flight.

**How to apply:** Serialize order identity with a PostgreSQL advisory transaction lock, atomically move the unique claim from `claiming` to `calling`, let only that updater call WhiteBIT, and update the claim plus all order funding snapshots in one transaction.

WhiteBIT’s public asset catalog can mark an asset deposit-enabled while omitting its deposit-network list. Exclude only that asset; continue to reject malformed populated lists and require an exact advertised asset/network match.

**Why:** Invalidating the entire catalog for one internally inconsistent asset disables every healthy route, while inferring networks from unrelated fields could authorize an unsupported address request.

**How to apply:** Treat a missing deposit-network list as no executable capability for that asset, but fail the catalog closed when a provided list has the wrong type or invalid entries.