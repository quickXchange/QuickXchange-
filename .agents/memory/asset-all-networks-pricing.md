---
name: Asset all-networks pricing
description: Canonical representation and precedence for pricing rules scoped to every network of one crypto asset.
---

Represent an asset-wide crypto selector with the immutable crypto asset ID, with no asset symbol, network, payment method, or settlement-option ID on that side. A null crypto asset ID and null settlement-option ID mean broad Any; the legacy all-networks marker exists only for migration compatibility.

**Why:** Symbols and network rows are mutable presentation/routing data. The parent asset ID is stable, supports current and future enabled networks without duplicated rules, and prevents a missing option ID from ambiguously meaning either one asset or Any.

**How to apply:** Resolve a customer's selected crypto network to its parent asset ID before matching. Match concrete settlement-option/network rules before asset-ID rules, and asset-ID rules before broad Any. Admin may use client-only asset option IDs, but must persist only catalog asset IDs.