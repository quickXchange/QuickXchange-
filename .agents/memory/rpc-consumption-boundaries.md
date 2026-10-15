---
name: RPC consumption boundaries
description: How to reduce monitoring cost without reassigning deposit ownership or losing legacy watches.
---

Use existing immutable order funding and watches to decide independent chain
monitoring requirements; today's catalog deposit provider is not authoritative
for an older assigned address.

**Why:** Production retained Manual watches even where the current catalog
provider was WhiteBIT. Provider-created deposit events cannot establish payment
to an unrelated pre-existing Manual address.

**How to apply:** Keep active watches, confirming evidence, recent applied
reorg checks and unresolved eligible registrations on the operational cadence.
Idle readiness may be cheaper only while respecting its existing freshness
fence and waking promptly when work or Manual/fallback availability appears.
Never use catalog edits alone to retire or redirect an existing address.

WhiteBIT-only networks, across all supported adapters, with no independent work or effective Manual fallback
should pause periodic RPC completely, not erase endpoint/provider/wallet configuration.
Explicit Owner bulk monitoring controls may change enable flags while preserving
those settings and honoring independent workload protections.
Selecting Manual resumes readiness, not customer deposit permission.

**Why:** The Owner requested zero unnecessary polling while retaining reversible
Manual/RPC configuration. A missing or inactive watch does not prove an unpaid
Manual order is safe to ignore.

**How to apply:** Include eligible legacy orders lacking active watches and
unresolved evidence in the pause gate. Preserve health timestamps so old proofs
expire normally, respect quota backoff, and retain explicit Admin tests.

Retaining a Manual wallet or tracking switch must not cause WhiteBIT-only
receiving-wallet previews/saves to probe RPC. For fallback readiness, both
fallback opt-in and tracking must be effective; Manual provider selection still
maintains network readiness without automatically granting deposit permission.

**Why:** The Owner wants reversible Manual/RPC configuration, not parallel
polling merely because those saved fields remain populated.

**How to apply:** Keep WhiteBIT permission and Manual/RPC readiness visibly
separate. Do not confuse a missing saved endpoint reference with failure of an
available endpoint secret, or fake a fresh successful scan when configuration
is absent.

Application RPC dispatch counts are not billing totals.

**Why:** Local cooldowns emit attempted-operation traces without another
outbound request, and hosting environments can share or override provider accounts.

**How to apply:** Meter actual dispatch after cooldown/deadline gates, attribute
network/method/purpose without sensitive material, and distinguish modeled CUs
from provider account usage. Reconcile invoices with provider-side records rather
than asserting exact historical attribution from source code alone.

Bulk RPC intent is provider-aware only in Automatic mode. Keep Current genuinely
preserves the corresponding switch. Explicitly disabling Manual monitoring must
leave new Customer Deposits OFF, even if the operation originally captured ON.
A shared network may remain enabled while the selected asset monitor is OFF.

**Why:** The Owner requested reversible, independently controllable monitoring;
restoring the old deposit flag without working RPC would contradict that intent.
Network-level obligations from another asset must not be mistaken for a problem
with a safely disabled selected asset.

**How to apply:** Reuse the worker's immutable-order workload query for guards
and progress. Preserve watches, confirmation/reorg evidence and missing-watch
legacy obligations. RPC preparation returns a proof but does not publish it:
persist it only after the job fence and exact current configuration still match,
then use the existing readiness authority before restoring deposit permission.

Configuration wallet registration must remain separate from immutable financial
order watches. Compatible tokens may share a canonical network/address/memo
target, but never merge their order ownership or rewrite frozen order addresses.

**Why:** The Owner requested shared wallet registration and reversible WhiteBIT
standby while preserving historical deposit obligations. A catalog wallet is
not itself an order or proof of a customer payment.

**How to apply:** Deduplicate configuration targets, retain old targets on
address changes, and let the existing order engine register financial watches.
Standby registration alone must not trigger RPC polling.

Persist the proof capture timestamp together with its readiness fingerprint.

**Why:** A configuration can appear verified while the first actual financial
watch rejects a fingerprint that has no trusted capture time.

**How to apply:** Fence both values against exact current identity and fresh
network health. Reuse a batch probe rather than reprobing each token at enable.

Wallet verification and bulk provider assignment must exclude each other
throughout the remote-verification interval, not only during database writes.

**Why:** A second bulk action can otherwise capture the wallet operation's
temporary Customer Deposits OFF state as the original intent and permanently
lose the requested ON restoration.

**How to apply:** Fence admission in both directions, reject duplicate wallet
saves, and retain current Owner/configuration checks before activation.
Control-session coordination must not occupy shared application-pool slots
while the operation needs pooled transactions to finish its RPC work.
