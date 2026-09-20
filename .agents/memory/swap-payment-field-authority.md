---
name: Swap payment-field authority
description: Defines the source of truth and snapshot boundary for Manual Swap payment-method customer fields.
---

For new Manual Swap quotes, the selected payment method's active Admin field definitions are the only dynamic customer-field schema. Preserve their stored order and properties, and apply the source `send` or target `receive` direction as appropriate. Do not prepend standard fields, merge legacy arrays, or synthesize deleted fields.

**Why:** Runtime fallback fields and a fiat-to-crypto exception caused Admin deletions to reappear or disappear inconsistently in Step 2. A configuration refresh was not enough because quote snapshots could still carry an older schema.

**How to apply:** Filter disabled definitions at the public configuration boundary, include the current field schema in quote freshness, snapshot it into new signed quotes, validate submitted details against that snapshot in both fiat directions, and leave existing order snapshots unchanged.