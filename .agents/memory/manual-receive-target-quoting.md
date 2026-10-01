---
name: Manual receive-target quoting
description: Financial correctness constraints for reverse quoting a customer-entered Swap receive amount.
---

Reverse Manual Swap quoting must reuse authoritative forward pricing, not invert a displayed rate. Search tier interiors separately from exact boundaries and fallback gaps: receive output can fall at a boundary despite increasing within each segment. A configured source maximum must be tested even when the rough rate-based estimate exceeds it. Bound the whole search in time and attempts; exhausting that budget is an availability failure, not proof that the customer's target is impossible. Only the final forward ticket's actual send and receive amounts should be displayed and submitted together with its signature.

**Why:** Fixed and selected add-on fees, target rounding, tier discontinuities, and independently refreshed reference rates defeat simple reciprocal arithmetic and naive global binary search. A rough estimate outside a cap does not prove that the exact capped boundary is infeasible.

**How to apply:** When changing pricing, limits, or quote search, test feasible and impossible targets on both sides of tier boundaries, with very wide source limits and narrow fiat target maxima. Verify the final signed ticket against the requested receive target and route bounds before presenting it.

Resolve stable route configuration and the currency/rate reference basis once per reverse-search request and reuse them in the canonical forward oracle; never turn this into a cross-request Admin-configuration cache.

**Why:** A production receive search exhausted its deadline while the same route passed quickly in Development. Rebuilding full settlement catalogs, matched rules, selected add-ons, and reference data for every numeric probe amplifies database latency and can consume the whole search budget without a pricing error. A provider-cache rollover during the search can also move its pricing oracle.

**How to apply:** Capture reference rates and their provenance within one request without extending the shared cache TTL. Keep amount-dependent tier selection, canonical fees/rounding, funding checks, and final-ticket validation authoritative. Verify both request-context reuse and a real backend quote; mocked browser quote responses cannot prove server availability.

Use semantic quote identities rather than refreshed option-object identity, and include hidden pricing configuration in invalidation.

**Why:** Catalog refreshes can abort unchanged in-flight quotes, masking backend failures through repeated loading. A pre-amount rate intentionally excludes fixed fees, so rate equality alone does not prove financial configuration equality.

**How to apply:** Fence edits synchronously, cancel superseded requests, and bound browser settlement independently of transport abort behavior. Identical polls must retain identity; fee-only and tier-only edits must change it.