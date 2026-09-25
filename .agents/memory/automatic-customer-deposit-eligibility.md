---
name: You Send crypto authority
description: Defines explicit Admin visibility intent plus exact-route safety gates for public customer sends.
---

Swap → You Send → Crypto requires enabled, non-deprecated Admin asset/network rows, an explicit customer-deposit toggle, and a configured provider. Manual Wallet also needs a valid saved address; monitoring readiness is required only when Manual Wallet tracking is ON. WhiteBIT visibility additionally requires exact provider mapping, runtime readiness, and the current exact-route permission proof, regardless of an optional Manual Fallback address. Reconciliation may revoke an unsafe route, but must never re-enable an Owner-disabled route.

**Why:** Provider assignment and wallet validity describe capability, not operator intent. Re-enabling a deliberately disabled wallet can expose a route without Owner approval; displaying a WhiteBIT route with stale proof or a Manual route lacking a usable wallet would misrepresent funding readiness. An invalid optional fallback must not suppress independently valid WhiteBIT funding.

**How to apply:** Require the explicit flag for source selectors and order acceptance, plus current exact-route safety checks. Do not require monitoring when Manual Wallet tracking is OFF. Keep provider capability and optional fallback validation separate. Reconciliation is one-way safe and may disable only.