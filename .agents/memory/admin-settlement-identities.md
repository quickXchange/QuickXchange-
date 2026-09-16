---
name: Admin-driven settlement identities
description: Visual contract for representing Admin-managed fiat currencies and payment methods throughout public Swap selection.
---

Public Swap identities must derive the currency code, payment-method name, and uploaded method logo from each live settlement option. A payment method's flag must derive from that option's fiat currency, never from the brand's home country or a generic method-level country.

**Why:** Brand-country overrides gave multi-currency methods such as Wise, Revolut, PayPal, and Skrill incorrect badges whenever their selected fiat differed from the brand's origin. Currency-specific identity keeps every attachment accurate.

**How to apply:** Reuse one renderer for selected fields and dropdown rows. Resolve its badge from the settlement option's asset code, retain a code fallback for unknown future currencies, and verify the complete fiat catalog rather than only visible or seeded examples.

Completed-order summaries must resolve payment-method identity from the persisted settlement option ID, not from the displayed route/network label.

**Why:** Multiple EUR methods such as Paysera, BBVA, N26, Revolut, Wise, bunq, and SEPA can all use the same `SEPA` route label. Route-label matching can therefore display another method's logo.

**How to apply:** Include customer-safe source and target settlement option IDs in order read projections, then match those IDs against the live settlement options. Use route labels only when they identify exactly one option.