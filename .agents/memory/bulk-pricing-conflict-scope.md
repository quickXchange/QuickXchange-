---
name: Bulk pricing conflict scope
description: How atomic bulk pricing mutations handle conflicts in catalogs that may already contain unrelated legacy ambiguity.
---

For an atomic bulk pricing mutation, validate each selected rule's final form against the complete final catalog, but do not revalidate pairs made only of untouched rows.

**Why:** Operator-managed catalogs can contain pre-existing legacy ambiguity. Revalidating every untouched pair makes an unrelated old conflict block enable, disable, edit, or delete for otherwise valid selected rules.

**How to apply:** Build the final catalog in the transaction, then run conflict checks with each changed rule as the candidate against all final rows. Keep optimistic versions and all other validation all-or-none.