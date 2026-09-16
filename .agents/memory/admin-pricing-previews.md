---
name: Admin pricing previews
description: Boundary between administrative price testing and customer-facing route availability.
---

Administrative pricing calculators may compute a manual quote even when customer deposits are disabled for the selected crypto source, but only through an operator-protected preview route. Public customer quote routes must continue enforcing funding availability.

**Why:** Operators need to test rule matching and fee calculations before enabling a deposit route, while customers must never receive an actionable quote for a route that cannot accept funds.

**How to apply:** Keep availability bypasses scoped to authenticated admin previews. Never reuse them for public quotes or order creation, and do not include unavailable funding instructions in preview responses.

The Price a route card intentionally exposes only Source Option and Target Option. Its quote calculation uses a fixed internal preview amount and must not render an Amount label, input, currency control, or reserved layout slot.

**Why:** This card is for checking route selection, rule matching, and representative fees; a visible amount field made the compact operator workflow look like a customer quote form.

**How to apply:** Keep the fixed amount confined to the protected quote-preview request. Place equal Source and Target selectors side by side with the action directly after them, and preserve a clear gap before the Pricing rules card.