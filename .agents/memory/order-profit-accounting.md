---
name: Order-profit accounting scope
description: Owner requirements and evidence boundaries for realized profit, historical costs and accounting-currency separation.
---

The Owner's current primary accounting currency is EUR. Revenue reporting is order-based and only final completed Swap/Convert orders qualify for realized profit. Existing orders and customer pricing must not be rewritten to implement accounting.

**Why:** The Owner explicitly rejected the older expected-fee/pricing-version report in favor of actual executed quantities, verified acquisition costs, fees and losses.

**How to apply:** Keep transaction volume, gross spread and net profit distinct. Never combine currencies without independently evidenced historical conversion. Missing historical acquisition evidence means profit unavailable, never a synthetic zero or today's market price.

Future cost settings become effective by order creation time, not completion time. Historical attestations and corrections are separate Owner-reviewed accounting evidence. A configured provider quote or affiliate markup does not itself prove that commission was received.

**Why:** Applying newly entered costs to older or already-active orders would silently invent historical economics. Convert customer funds can belong to provider custody, not exchange revenue.

**How to apply:** Preserve old order snapshots and audit trails. Keep corrections append-only and require explicit evidence for actual proceeds/costs. Retain accounting history during application rollback.
