---
name: WhiteBIT BEP20 deposit policy
description: Owner's requested destination provider and legacy-address retirement constraint.
---

New BNB, USDT and USDC BEP20 deposits should use WhiteBIT.
Legacy Manual addresses and watches may be retired only after verifying there
are no pending deposits, active orders or outstanding obligations.
Keep Manual/RPC available in Admin with all its configurations preserved so
the Owner can switch back. Monitoring should automatically resume when Manual
is selected again, without silently enabling customer deposits.

**Why:** The user requested this reversible provider policy and explicitly made
watch retirement conditional on safe reconciliation. The Owner identified the
legacy orders as tests but still required verification of no real deposits or
outstanding obligations before closure.

**How to apply:** Use existing exact-route WhiteBIT permission and customer
deposit eligibility controls. A new-deposit provider switch must not rewrite
historical funding snapshots or remove independent monitoring of old addresses.
