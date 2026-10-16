---
name: Customer order detail projection
description: Data-honesty boundary for customer-facing order detail redesigns.
---

**Rule:** Additional Payment Details means the customer-entered Widget Step 2 values for that exact order. Project configured fields by matching saved values to that order's immutable, authenticated field definitions; never derive them from current Admin configuration, raw funding/provider maps, or an arbitrary field-name allowlist. Keep blockchain evidence in its own conditional Transaction Details section. A "User" label can use authenticated-account context, but never imply the account's current email was the order contact unless the order provides it.

**Why:** Funding and settlement metadata can mix customer input with provider/monitoring state. A fixed list hides future custom Step 2 fields, while blindly flattening JSON leaks internal fields. Historical Convert orders may lack verifiable saved field definitions; their unknown custom labels cannot safely be reconstructed from today's configuration or guessed from keys.

**How to apply:** Use a read-only server projection of customer-entered standard values and only dynamic values whose keys match field definitions frozen with the order or recoverable from its signed quote. For expired quotes, historical signature verification must never authorize order creation. Omit unmatched/blank values and unsupported legacy fields rather than leaking raw maps. Apply the same projection in Admin, customer profile's Admin order view, and Customer direct-link/drawer views; preserve exact copied values.

Admin payout clipboard exports must use the customer's saved receiving-payment identity, never their website profile name or sending-side account. Omit social/contact details and unavailable fields; preserve exact receive amounts/currencies and essential payment identifiers across configured methods.

**Why:** The user explicitly distinguishes the payment recipient from the account holder using the website and requires clipboard amounts to retain financial precision rather than the three-decimal display limit.

**How to apply:** Start from order-owned, safely projected payment fields; prefer frozen field semantics to current Admin configuration. Do not guess a recipient for legacy orders without reliable payment-field provenance. Recover raw whitespace only for an already-projected key whose saved value agrees.