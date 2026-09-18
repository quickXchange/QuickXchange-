---
name: Optional exact path overrides
description: Existing Swap pricing remains executable while concrete exact-rate paths act as optional overrides.
---

Swap/manual-desk pricing must preserve existing selector and provider-backed paths. Operators may optionally configure an exact positive rate for a concrete source and target settlement-option pair. Select the best rule for the actual source-to-target direction first. A reciprocal exact path may override only a selector-free Any-to-Any fallback, never a route-specific direct rule.

**Why:** The operator clarified that exact manual rates are a choice, not a restriction on the widget. Making exact paths mandatory caused the public Swap widget to report temporary unavailability despite valid existing pricing rules.

**How to apply:** Resolve direct rules by settlement specificity, selector specificity, configured priority, and stable ID without considering exact-rate presence. If no route-specific direct rule matches, try a reciprocal exact rule before the Any-to-Any fallback. Preserve exact provenance only when an exact override is used.

Existing markup and fixed fees apply after the exact base rate. Convert/Quickex does not consume exact manual paths.