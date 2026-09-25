---
name: WhiteBIT deposit integrity
description: Durable identity, ledger, order-funding, and reconciliation rules for WhiteBIT deposits.
---

WhiteBIT webhook authentication must use the webhook's own key and secret, never fall back to trading API credentials. The public domain-verification key is a third, independently scoped value.

**Why:** WhiteBIT documents webhooks as separate entities with their own signing credentials. Accepting trading credentials for incoming events crosses a trust boundary and can mask missing webhook configuration.

**How to apply:** Treat missing dedicated webhook credentials as not ready and reject deliveries until they are configured; do not change trading API configuration or publish the signing credentials through domain verification.

Credit eligibility requires a stable WhiteBIT transaction or unique ID. When both appear over time, they are aliases for one deposit and must be locked and resolved together. Once credited, economic fields stay frozen; conflicting terminal replays are quarantined for review rather than changing history without a ledger adjustment.

**Why:** WhiteBIT webhook and history records can expose different identifier combinations, corrected amounts, and network-qualified tickers. Treating each representation independently can double-credit or desynchronize the immutable balance ledger from customer history.

**How to apply:** Normalize provider tickers separately from the base asset/network request contract, lock every stable alias in deterministic order, credit once per immutable deposit row, and reconcile each address from offset zero to its high-water identity without requesting beyond the provider’s 10,000-record window.

A signed WhiteBIT `deposit.canceled` webhook is audit-only until Production has an approved deposit-status constraint change. It must not change a deposit, ledger, address, or order; the existing accepted/updated/processed and history evidence paths remain authoritative.

**Why:** Production's old WhiteBIT deposit constraint rejects `canceled`, and its managed Publish schema diff did not expose the handwritten CHECK change. Writing the new value would fail webhook delivery; treating an address-only cancellation as order-wide would also risk an unrelated funding attempt.

**How to apply:** Verify webhook signature and envelope replay protection, persist the authenticated delivery, then acknowledge cancellation without deposit processing. Do not claim that audit-only cancellation blocks later authenticated processed/history evidence; that would require a separate approved lifecycle design.

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

WhiteBIT's current webhook documentation describes a separately generated webhook API key and HMAC secret; the public ownership-verification key is a third, distinct value. A successful signed trading API request does not establish that webhook signatures will validate.

**Why:** Earlier integration assumptions allowed falling back to trading API credentials for callbacks, but the provider now explicitly describes the webhook as a separate entity with its own generated credentials. A public verification response or unsigned 401 proves reachability and rejection, not successful signed delivery.

**How to apply:** Before claiming webhook readiness, confirm which generation of webhook credentials the account uses and verify a genuine signed delivery using its dedicated key/secret. Keep `/whiteBIT-verification` at the service root, and never treat its public key as an HMAC secret. Do not infer callback authentication from a successful deposit-address call.

Archived-order deletion must preserve protected WhiteBIT deposit and address records. Refuse permanent deletion when an order still owns those records rather than granting broad delete rights or silently removing financial provenance.

**Why:** The runtime database role intentionally cannot delete protected WhiteBIT address rows, and those rows anchor provider reconciliation history that must outlive ordinary Admin cleanup.

**How to apply:** Lock and re-check the archived order inside the deletion transaction, probe for protected provider dependencies, return an explicit per-order conflict when present, and delete only ordinary order-owned sidecars before removing the order.

Every WhiteBIT idempotency target must have a named unique index in the live database, not only in the ORM schema or an old `CREATE TABLE` definition.

**Why:** Schema reconciliation can leave column-level unique constraints absent while application code still uses targeted `ON CONFLICT`. The first deposit webhook, address claim, checkpoint update, or ledger credit then fails with a server error instead of deduplicating.

**How to apply:** Audit development and production system catalogs for every WhiteBIT conflict target, check for duplicates before repair, restore missing named unique indexes through additive migrations, and run webhook, address-convergence, reconciliation, and ledger replay tests afterward.

WhiteBIT provisioning must lock credential state before provider state and carry one exact credential snapshot from the durable claim decision into the irreversible address request.

**Why:** Re-reading credentials after claiming can race an Admin rotation or disable operation, causing the claim to be authorized under one state while the provider call uses another.

**How to apply:** Acquire the credential advisory lock before the provider lock, read settings and persisted credentials through the same transaction, snapshot persisted-or-environment credentials, and pass that snapshot explicitly to the provider call.

The order-address claim's provider ticker/network must equal the identity used in the actual address request, not just the canonical route identity. Provider enablement must likewise project verified route proofs onto provider asset/network pairs before filtering live capabilities.

**Why:** A mapped route can create an address successfully yet fail exact-tuple webhook/history association if its preclaimed provider identity remains canonical. Filtering activation capabilities by canonical codes can also make a valid mapped proof appear unsupported.

**How to apply:** Freeze both canonical and provider identities at quote/order creation, reject mismatched durable claims before any provider call, and keep canonical codes only for route/proof identity while using provider codes for calls and reconciliation.

Memo-less WhiteBIT BNB/BEP20 history may represent the memo as `null` even when a successful order-address claim stores an empty string. Treat those two absence representations consistently for exact-tuple matching; do not relax matching for nonempty memos.

**Why:** A read-only provider history record for a processed deposit matched its generated order address, asset, and network, but a null history memo could not match the claim's empty-string memo. No deposit or order transition was recorded.

**How to apply:** Normalize only blank/missing memos at the claim and evidence boundary, test both signed webhook and history paths, and keep the address plus provider asset/network uniqueness safeguards intact. A lack of stored webhook delivery does not prove the provider never sent one.

Keeping a Manual receiving address on a WhiteBIT route is not consent to use it as a fallback. Fallback requires an explicit opt-in frozen with the order and still enabled on the exact current route; absence of either proof means no customer fallback instructions.

**Why:** Operators may retain saved addresses for reference while choosing provider-created deposit addresses. Implicit fallback could direct customers to an address the operator never authorized for that purpose. Disabling fallback must not erase the saved address.

**How to apply:** Keep provider provisioning independent of fallback consent, omit opted-out addresses from signed customer snapshots, and require both frozen and live opt-in when handling provider failures or recovering unresolved claims. Existing orders without a frozen choice fail closed.