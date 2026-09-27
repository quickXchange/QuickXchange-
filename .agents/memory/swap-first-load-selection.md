---
name: Swap first-load selection ownership
description: Why the Swap widget should have one authoritative initial pair selection path.
---

Choose the Swap pair exactly once from the current public directed routes: valid market-link or event requests take precedence, followed by the saved default if still eligible, then the first eligible directed route. Keep later config refreshes from replacing a visitor's valid manual choice.

**Why:** A separate legacy initialization effect ran after the new route-aware initializer and silently overwrote its pair with the first fiat and crypto options. The resulting UI looked plausible but did not show the saved pair or the first eligible route.

**How to apply:** When changing first-load behavior, audit all effects that write either leg of the pair. Use one route-aware initializer rather than layering another default setter on top; exercise first load and later config refresh with a non-leading saved pair.