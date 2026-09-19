---
name: You Send crypto authority
description: Defines the boundary between Admin-configured selector visibility and runtime funding validation.
---

Swap → You Send → Crypto visibility follows enabled, non-deprecated Admin asset/network rows whose customer-deposit toggle is explicitly enabled and whose provider is not None. Reconciliation may revoke an unsafe route, but must never re-enable an Owner-disabled route.

**Why:** Provider assignment and wallet validity describe capability, not operator intent. Re-enabling a valid but deliberately disabled wallet can expose a deposit route without Owner approval.

**How to apply:** Require the explicit customer-deposit flag for source selectors and order acceptance. Validate the exact row's Manual wallet or provider capability before enabling; reconciliation is one-way safe and may disable only.