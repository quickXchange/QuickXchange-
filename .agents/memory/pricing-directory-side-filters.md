---
name: Pricing directory side filters
description: Why customer-side directory filters overlap for two-sided routes and exclude unrestricted fallback rules.
---

Classify directory rules by their actual configured source and target selectors, not their names. The side filters intentionally overlap: a two-sided route belongs to both You Send and You Receive. An unrestricted Any → Any fallback belongs only to All Rules.

**Why:** These filters describe which customer sides a rule explicitly configures, not a new mutually exclusive pricing mode. Assigning a two-sided rule to only one filter would hide a genuine association; listing unrestricted fallback rules under either side would imply a constraint they do not have.

**How to apply:** Include concrete option IDs, asset-wide IDs, and supported legacy route selectors. Keep directory filtering separate from executable pricing resolution. Reset selections on filter changes and intersect bulk targets with current search/status/direction matches; never automatically persist prices when browsing.

Immutable settlement-option identity takes precedence over stale legacy labels. When one side has an option ID and the opposite side does not, that opposite side is Any unless it has an explicit crypto asset ID or a supported asset-wide all-networks selector.

**Why:** Older partial-wildcard saves can retain currency/network/payment labels on an authoritative Any side. Counting those labels creates false direction matches, whereas discarding a genuine opposite asset selector would hide a real two-sided route.

**How to apply:** Match the existing pricing resolver's effective-selector semantics in directory classification. Do not infer a different executable direction from a rule name or rewrite saved pricing to correct its presentation.
