---
name: Bulk pricing conflict scope
description: How bulk pricing mutations isolate stale or conflicting rules without re-litigating unrelated legacy ambiguity.
---

Bulk pricing edits update every safe selected rule and report stale, read-only, missing, or genuinely conflicting rules individually. Changes that do not affect matching, such as fees, must not trigger route-overlap validation.

**Why:** Operator-managed catalogs can contain pre-existing legacy ambiguity, and one stale rule should not block commission changes for the rest of a large selection.

**How to apply:** Hold the pricing advisory lock, validate and compare versions per rule, and use guarded writes whose affected-row result is checked. Only selector/priority changes run ambiguity checks; return updated IDs and structured skips.

Bulk creation is different from editing selected rows: expand the requested one-to-many route set first, then atomically upsert by exact source option, target option, and priority. An existing exact route is updated with the submitted settings rather than duplicated.

**Why:** Retrying a batch or selecting an already configured payment method must not create parallel rules for the same route, and partial creation would leave operators with an incomplete matrix.

**How to apply:** Validate the complete final rule set under the same advisory lock before any insert or update, and reject the entire batch when it would introduce ambiguity.