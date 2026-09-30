---
name: Swap first-load selection ownership
description: Why the Swap widget should have one authoritative initial pair selection path.
---

Choose the Swap pair exactly once from the current public directed routes: valid market-link or event requests take precedence, followed by the saved default if still eligible, then the first eligible directed route. Keep later config refreshes from replacing a visitor's valid manual choice.

**Why:** A separate legacy initialization effect ran after the new route-aware initializer and silently overwrote its pair with the first fiat and crypto options. The resulting UI looked plausible but did not show the saved pair or the first eligible route.

**How to apply:** When changing first-load behavior, audit all effects that write either leg of the pair. Use one route-aware initializer rather than layering another default setter on top; exercise first load and later config refresh with a non-leading saved pair.

In the Mini App, amount/rate editing must wait until both initial route legs and the route-reset work have settled, not merely until the exchange controls render.

**Why:** Asynchronous default-route resets can discard an early receive edit and change the quote side back to Send. Advancing a debounce clock cannot restore input lost during initialization; readiness and timer behavior must be checked independently.

**How to apply:** Make route readiness an explicit prerequisite for editable quote controls and quote scheduling. Browser fixtures should await the selected pair before editing, then advance any mocked debounce clock.