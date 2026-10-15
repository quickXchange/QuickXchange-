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

WhiteBIT-only EVM networks with no independent work or opted-in Manual fallback
should pause periodic RPC completely, not erase or disable their configuration.
Selecting Manual resumes readiness, not customer deposit permission.

**Why:** The Owner requested zero unnecessary polling while retaining reversible
Manual/RPC configuration. A missing or inactive watch does not prove an unpaid
Manual order is safe to ignore.

**How to apply:** Include eligible legacy orders lacking active watches and
unresolved evidence in the pause gate. Preserve health timestamps so old proofs
expire normally, respect quota backoff, and retain explicit Admin tests.

Application RPC dispatch counts are not billing totals.

**Why:** Local cooldowns emit attempted-operation traces without another
outbound request, and hosting environments can share or override provider accounts.

**How to apply:** Meter actual dispatch after cooldown/deadline gates, attribute
network/method/purpose without sensitive material, and distinguish modeled CUs
from provider account usage. Reconcile invoices with provider-side records rather
than asserting exact historical attribution from source code alone.
