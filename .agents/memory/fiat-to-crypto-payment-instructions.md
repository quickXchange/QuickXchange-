---
name: Fiat-to-crypto payment instructions
description: Security and lifecycle boundary for order-specific customer payment instructions.
---

Order-specific bank/payment instructions apply only to manual fiat/payment-method → crypto orders. Expose only an allowlisted customer-safe object through owner or signed tracking-token projections.

**Why:** Payment coordinates are sensitive and can change per order. Reusing customer settlement fields, operational notes, or hardcoded defaults risks leaking internal data or showing the wrong recipient.

**How to apply:** Keep Admin edits optimistic and audited without raw payment values. Treat “Mark as Paid” as an idempotent customer report with its own timestamp; only an authorized operator may advance settlement to funds confirmed.

Crypto send-side deposits are a different payment path. Their deposit-details popup shows automatic blockchain payment detection information but no “Mark as Paid” control; do not call the fiat payment-details endpoint.

**Why:** The existing customer report endpoint accepts fiat payment-details orders, not crypto deposits. The user later explicitly requested removing the disabled crypto button altogether without changing payment logic.

**How to apply:** Keep the order-frozen crypto address, memo, asset/network, and provider source visible and copyable where applicable. Do not infer payment confirmation from opening or dismissing the deposit details.