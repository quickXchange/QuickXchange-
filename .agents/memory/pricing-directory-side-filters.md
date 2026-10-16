---
name: Pricing directory side filters
description: Why customer-side directory filters overlap for two-sided routes and exclude unrestricted fallback rules.
---

Classify directory rules by their actual configured source and target selectors, not their names. The side filters intentionally overlap: a two-sided route belongs to both You Send and You Receive. An unrestricted Any → Any fallback belongs only to All Rules.

**Why:** These filters describe which customer sides a rule explicitly configures, not a new mutually exclusive pricing mode. Assigning a two-sided rule to only one filter would hide a genuine association; listing unrestricted fallback rules under either side would imply a constraint they do not have.

**How to apply:** Include concrete option IDs, asset-wide IDs, and supported legacy route selectors. Keep directory filtering separate from executable pricing resolution. Reset selections on filter changes and intersect bulk targets with current search/status/direction matches; never automatically persist prices when browsing.
