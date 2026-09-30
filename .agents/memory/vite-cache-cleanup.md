---
name: Vite cache cleanup
description: Required workflow restart after removing Vite or package caches from a running workspace.
---

After deleting Vite optimization caches or package-manager caches, restart every running Vite workflow before opening lazy routes.

**Why:** A server left running across cache deletion served an inconsistent optimized dependency graph. Public routes appeared healthy, but a lazy Admin route failed with a module-script error and an invalid React hook call.

**How to apply:** Treat cache cleanup and the relevant workflow restart as one operation. Verify at least one lazy route after restart, not only the root page.

Keep React, both JSX runtimes, and ReactDOM in one explicit Vite dependency-optimization group when this workspace serves lazy Admin routes.

**Why:** Basic module deduplication alone did not prevent a mobile tab from receiving an invalid React hook dispatcher after repeated hot updates; the failure recurred as `useMemo` on a null dispatcher.

**How to apply:** Preserve the explicit React optimization group when changing Vite configuration, and validate several authenticated lazy routes after any dependency-graph change.

Fixture-only Playwright Vite servers must use a different optimization cache directory from the managed preview when both run against one artifact.

**Why:** Different mode/environment hashes can overwrite shared dependency metadata, leaving the live preview's module requests rejected with 504 Outdated Optimize Dep errors even though both servers start successfully.

**How to apply:** Isolate test-mode caches before launching concurrent browser checks. If the preview already experienced the collision, restart its managed workflow once after separating the caches.