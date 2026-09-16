---
name: Workspace cache triage
description: How to distinguish useful project caches from disposable disk pressure during performance cleanup.
---

Do not classify a cache as bloat based on size alone. Keep healthy browser, package-manager, Vite, and TypeScript caches when they directly avoid downloads or recompilation; disposable installer download caches can be removed when no installer is running.

**Why:** A performance audit found that the largest safe disk recovery came from an inactive pip download cache, while deleting the smaller Playwright browser cache would have forced a large download and made the next test run slower.

**How to apply:** Measure cache contents separately, identify the process that owns each cache, check for active writers, and compare the next-run cost before deleting. Exclude local caches from deployment context even when retaining them in the development workspace.