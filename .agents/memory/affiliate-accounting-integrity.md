---
name: Affiliate accounting integrity
description: Durable rules for attribution, commission snapshots, reversals, payouts, and QuickEx reconciliation.
---

Affiliate eligibility is determined at the authoritative aggregate completion. Snapshot the bound referrer and complete program terms in the same transaction as the status change; later referral or settings changes must never alter that event.

**Why:** Asynchronous processing and valuation review can happen much later. Reading live attribution or settings during processing would retroactively change who earns a commission or how much they earn.

**How to apply:** Treat completion events and positive/negative ledger entries as immutable financial evidence. Reversals append compensating entries. Payout requests reserve balance before any operator workflow.

QuickEx completion and reversal ingestion must not depend on a customer opening a status page. Worker and public refreshes share one provider-wide, persisted lease/cooldown, and completed orders remain eligible for reconciliation during a bounded reversal window.

**Why:** Customer-driven refresh misses unattended completions and later refunds, while uncoordinated polling can exhaust provider capacity during outages.

**How to apply:** Any new provider-status consumer must use the shared reconciliation coordinator, preserve exact aggregate identity, and write status plus affiliate outbox events atomically.

Only a completed provider-wide reconciliation may clear its failure count or advance/reset its cooldown. Unrelated successful provider operations must not alter reconciliation retry state.

**Why:** A successful order creation does not prove the provider order-list feed recovered; resetting its retry gate would make operator health inaccurate and allow unrelated traffic to bypass outage backoff.

**How to apply:** Keep provider-list lease, failure, and retry fields owned by the reconciliation coordinator. Other provider calls may invalidate local data caches, but must not mutate persisted reconciliation health.