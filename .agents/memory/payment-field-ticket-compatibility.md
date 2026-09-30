---
name: Payment field ticket compatibility
description: Keep signed manual-quote field validation aligned with the public payment-field contract.
---

Every payment-method field type allowed by the public API contract must also be accepted when validating the signed settlement snapshot in a manual quote ticket.

**Why:** A quote can be generated successfully with a legitimate dynamic field such as an account-holder name, yet every order using that quote will fail as a quote mismatch if the ticket verifier has a narrower field-type list.

**How to apply:** When payment-field types are added or renamed, update and test both the API schema and signed quote-ticket validation. Exercise at least one quote-to-order route that uses the new type.

Dedicated destination controls do not remove quote-required settlement keys. Manual Admin keys remain independent, even if named `destinationAddress` or `memo`; Convert must serialize dedicated values into exact signed-schema keys when that schema requires them.

**Why:** Hiding all wallet-address fields lost custom Admin values, and omitting dedicated Convert keys failed server validation even though the visible address input was complete. The backend validates the signed settlement map separately from top-level payout fields.

**How to apply:** Separate rendering deduplication from payload completeness. Preserve every active signed field under its exact key, and never merge blank top-level destination values over Manual settlement values.