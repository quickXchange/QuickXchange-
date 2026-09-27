---
name: Payment method identity snapshots
description: How to preserve the selected payment method without invalidating signed settlement quotes.
---

Snapshot the selected payment method’s stable option ID, catalog ID, display name, and logo reference when the order quote is created. Customer payment screens should use this order-owned identity rather than guessing from currency or consulting a mutable catalog.

**Why:** Payment methods can be renamed, deleted, or have logos changed after an order is created. Adding presentation fields directly to a signed settlement snapshot can also make harmless logo changes look like executable settlement-term changes during quote revalidation.

**How to apply:** Expose a customer-safe source payment identity from the persisted settlement snapshot. Compare only executable settlement fields when revalidating signed quotes; ignore presentation-only identity metadata. Keep order-specific bank details separately token-gated.

Admin corrections to the payment-method name on an existing Manual Swap order are presentation-only. They must not replace the persisted route, signed quote, bank instructions, or customer-facing payment identity. Provider-managed Convert orders remain synchronized with their provider instead of accepting local settlement edits.

**Why:** An apparent “method change” after order creation can otherwise direct an operator or customer to a different rail without revalidating pricing, fees, or payment instructions. A display correction is safe only when clearly labeled as such.

**How to apply:** Keep operational label overrides separate from executable settlement fields. A future feature that actually changes the settlement method needs an explicit re-quote and instruction/consent workflow rather than updating the old order’s method fields in place.