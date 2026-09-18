---
name: Payment method identity snapshots
description: How to preserve the selected payment method without invalidating signed settlement quotes.
---

Snapshot the selected payment method’s stable option ID, catalog ID, display name, and logo reference when the order quote is created. Customer payment screens should use this order-owned identity rather than guessing from currency or consulting a mutable catalog.

**Why:** Payment methods can be renamed, deleted, or have logos changed after an order is created. Adding presentation fields directly to a signed settlement snapshot can also make harmless logo changes look like executable settlement-term changes during quote revalidation.

**How to apply:** Expose a customer-safe source payment identity from the persisted settlement snapshot. Compare only executable settlement fields when revalidating signed quotes; ignore presentation-only identity metadata. Keep order-specific bank details separately token-gated.