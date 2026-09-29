---
name: Manual receive-target quoting
description: Financial correctness constraints for reverse quoting a customer-entered Swap receive amount.
---

Reverse Manual Swap quoting must reuse authoritative forward pricing, not invert a displayed rate. Search tier interiors separately from exact boundaries and fallback gaps: receive output can fall at a boundary despite increasing within each segment. A configured source maximum must be tested even when the rough rate-based estimate exceeds it. Bound the whole search in time and attempts; exhausting that budget is an availability failure, not proof that the customer's target is impossible. Only the final forward ticket's actual send and receive amounts should be displayed and submitted together with its signature.

**Why:** Fixed and selected add-on fees, target rounding, tier discontinuities, and independently refreshed reference rates defeat simple reciprocal arithmetic and naive global binary search. A rough estimate outside a cap does not prove that the exact capped boundary is infeasible.

**How to apply:** When changing pricing, limits, or quote search, test feasible and impossible targets on both sides of tier boundaries, with very wide source limits and narrow fiat target maxima. Verify the final signed ticket against the requested receive target and route bounds before presenting it.