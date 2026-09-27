---
name: Bulk pricing conflict scope
description: How bulk pricing mutations isolate stale or conflicting rules without re-litigating unrelated legacy ambiguity.
---

Bulk pricing edits are atomic across the selected rules: reject the whole edit with the offending rule ID and reason if any selected rule is missing, stale, read-only, or conflicting. Changes that do not affect matching, such as fees, must not trigger route-overlap validation.

**Why:** Operator-managed catalogs can contain pre-existing legacy ambiguity. Canonicalizing and rewriting unrelated legacy selectors during a commission edit can collide with an existing unique route, while silently skipping a selected rule leaves a supposedly uniform batch only partly changed.

**How to apply:** Hold the pricing advisory lock, validate and compare versions for the entire edit selection before writing, update only explicitly requested columns, and use guarded transactional writes whose affected-row result is checked. Only selector/priority changes run ambiguity checks. Other bulk actions may still return updated IDs and structured skips.

Bulk creation is different from editing selected rows: expand the requested one-to-many route set first, then atomically upsert by exact source option, target option, and priority. An existing exact route is updated with the submitted settings rather than duplicated.

**Why:** Retrying a batch or selecting an already configured payment method must not create parallel rules for the same route, and partial creation would leave operators with an incomplete matrix.

**How to apply:** Validate the complete final rule set under the same advisory lock before any insert or update, and reject the entire batch when it would introduce ambiguity.