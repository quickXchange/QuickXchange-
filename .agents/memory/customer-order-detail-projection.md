---
name: Customer order detail projection
description: Data-honesty boundary for customer-facing order detail redesigns.
---

**Rule:** Additional Payment Details means the customer-entered Widget Step 2 values for that exact order. Project configured fields by matching saved values to that order's immutable, authenticated field definitions; never derive them from current Admin configuration, raw funding/provider maps, or an arbitrary field-name allowlist. Keep blockchain evidence in its own conditional Transaction Details section. A "User" label can use authenticated-account context, but never imply the account's current email was the order contact unless the order provides it.

**Why:** Funding and settlement metadata can mix customer input with provider/monitoring state. A fixed list hides future custom Step 2 fields, while blindly flattening JSON leaks internal fields. Historical Convert orders may lack verifiable saved field definitions; their unknown custom labels cannot safely be reconstructed from today's configuration or guessed from keys.

**How to apply:** Use a read-only server projection of customer-entered standard values and only dynamic values whose keys match field definitions frozen with the order or recoverable from its signed quote. For expired quotes, historical signature verification must never authorize order creation. Omit unmatched/blank values and unsupported legacy fields rather than leaking raw maps. Apply the same projection in Admin, customer profile's Admin order view, and Customer direct-link/drawer views; preserve exact copied values.