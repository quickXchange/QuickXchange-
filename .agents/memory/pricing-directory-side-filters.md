---
name: Pricing directory side filters
description: Mutually exclusive pricing-directory groups based on the configured payment-method role, separate from actual route geometry.
---

The user requires mutually exclusive You Send and You Receive directory filters. A source payment method → crypto rule belongs only to You Send. An Any/crypto source → destination payment method rule belongs only to You Receive. An unrestricted Any → Any fallback belongs only to All Rules.

**Why:** Counting every configured side put EUR bank → USDT/USDC rules into You Receive merely because they have a crypto destination. The user explicitly rejected that overlap and required Select All and bulk edits never to cross the directional groups.

**How to apply:** Determine payment-method roles from settlement-option kinds, immutable fiat-option namespaces (including orphaned IDs), or authoritative legacy payment/payout fields—not rule names, bank names or currency strings. A source payment method wins; otherwise a destination payment method wins. Fully specified fiat-to-fiat routes use their explicit source, as do remaining two-sided asset-only routes. Keep single-side asset wildcards on their actual side. Reset selections on filter changes and intersect bulk targets with current matches; never persist prices while browsing.

Immutable settlement-option identity takes precedence over stale legacy labels. When one side has an option ID and the opposite side does not, that opposite side is Any unless it has an explicit crypto asset ID or a supported asset-wide all-networks selector.

**Why:** Older partial-wildcard saves can retain currency/network/payment labels on an authoritative Any side. Counting those labels creates false direction matches, whereas discarding a genuine opposite asset selector would hide a real two-sided route.

**How to apply:** Match the existing pricing resolver's effective-selector semantics in directory classification. Do not infer a different executable direction from a rule name or rewrite saved pricing to correct its presentation.

Directory classification is not route geometry: an exclusively You Send rule can still have a real crypto receiving asset.

**Why:** Reusing the exclusive filter predicate to render route endpoints would incorrectly turn the opposite endpoint into Any.

**How to apply:** Use effective side-presence checks for route labels and exclusive role classification only for directory membership and action scope.
