---
name: Playwright custom contexts
description: Why responsive tests should reuse the configured page fixture unless they explicitly recreate its environment.
---

Prefer the standard Playwright `page` fixture for layout tests. A page created from `browser.newContext()` does not automatically inherit the configured base URL or the API route fixtures installed on the standard page.

**Why:** A responsive geometry test measured an empty document, then crashed the application when a base URL was added without recreating the route fixtures. Both failures looked like UI regressions.

**How to apply:** Use `page.setViewportSize()` when the assertion depends only on dimensions. If a separate context is essential, explicitly provide its base URL and reinstall every required route fixture before navigation.