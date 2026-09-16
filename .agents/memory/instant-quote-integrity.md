---
name: Instant quote integrity
description: Rules that keep customer-visible instant quotes aligned with the order that is actually created.
---

An instant order must consume the exact signed quote ticket that produced the estimate shown to the customer. Any route, amount, or rate-mode change must immediately make that ticket unusable for submission. Overlapping quote requests must also be version-fenced so a slower response for old inputs cannot replace the current ticket.

**Why:** Re-quoting during submission can create an exchange at a materially different rate than the customer accepted. Post-render invalidation alone still leaves races from changed inputs and out-of-order provider responses.

**How to apply:** Bind each preview to all quote-defining inputs, ignore callbacks from superseded requests, disable submission whenever that identity changes, and recheck expiry immediately before the irreversible create. Only advertise instant exchange when signed order creation is ready; keep manual fiat routes independent.