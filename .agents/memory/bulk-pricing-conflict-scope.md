---
name: Bulk pricing conflict scope
description: How bulk pricing mutations isolate stale or conflicting rules without re-litigating unrelated legacy ambiguity.
---

Bulk pricing edits update every safe selected rule and report stale, read-only, missing, or genuinely conflicting rules individually. Changes that do not affect matching, such as fees, must not trigger route-overlap validation.

**Why:** Operator-managed catalogs can contain pre-existing legacy ambiguity, and one stale rule should not block commission changes for the rest of a large selection.

**How to apply:** Hold the pricing advisory lock, validate and compare versions per rule, and use guarded writes whose affected-row result is checked. Only selector/priority changes run ambiguity checks; return updated IDs and structured skips.