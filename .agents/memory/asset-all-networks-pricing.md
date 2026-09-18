---
name: Asset all-networks pricing
description: Canonical representation and precedence for pricing rules scoped to every network of one crypto asset.
---

Represent an asset-wide crypto selector as the asset code plus the explicit internal all-networks marker, with no settlement-option ID. Never infer asset scope from a null option ID alone, because legacy partial-wildcard payloads use null to mean broad Any.

**Why:** One explicit persisted selector supports current and future networks without duplicating rules, while preserving compatibility with older payloads that retain stale route fields after changing a side to Any.

**How to apply:** Match concrete settlement-option/network rules before asset all-networks rules, and asset all-networks rules before broad Any rules. Keep the synthetic Admin option ID client-only and never persist it.