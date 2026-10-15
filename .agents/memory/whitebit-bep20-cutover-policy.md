---
name: WhiteBIT BEP20 deposit policy
description: Owner's requested destination provider and legacy-address retirement constraint.
---

New BNB, USDT and USDC BEP20 deposits should use WhiteBIT.
Legacy Manual addresses and watches may be retired only after verifying there
are no pending deposits, active orders or outstanding obligations.

**Why:** The user requested this provider policy and explicitly made watch
retirement conditional on safe reconciliation.

**How to apply:** Use existing exact-route WhiteBIT permission and customer
deposit eligibility controls. A new-deposit provider switch must not rewrite
historical funding snapshots or remove independent monitoring of old addresses.
