---
name: Optional exact path overrides
description: Existing Swap pricing remains executable while concrete exact-rate paths act as optional overrides.
---

Swap/manual-desk pricing must preserve existing selector and provider-backed paths. Operators may optionally configure an exact positive rate for a concrete source and target settlement-option pair. A direct exact path has highest priority; its exact decimal reciprocal is next; ordinary selector/provider pricing handles the route when neither exact direction applies.

**Why:** The operator clarified that exact manual rates are a choice, not a restriction on the widget. Making exact paths mandatory caused the public Swap widget to report temporary unavailability despite valid existing pricing rules.

**How to apply:** Try a matching direct exact rule, then a matching reciprocal exact rule, then the established selector/provider fallback. Coverage and public availability must count all executable rules. Preserve exact provenance only when an exact override is used.

Existing markup and fixed fees apply after the exact base rate. Convert/Quickex does not consume exact manual paths.