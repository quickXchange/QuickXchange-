---
name: Authenticated public bundle boundaries
description: How to judge route-level code splitting when public pages immediately reflect authentication state.
---

Keep account, authentication-screen, affiliate, admin, and chart modules behind route-level dynamic imports. A shared authentication runtime may remain in the eager public graph when public navigation or exchange behavior must immediately reflect signed-in state.

**Why:** Removing the shared auth runtime would either change signed-in public behavior or delay/remount the public exchange. The meaningful performance boundary is that route-screen modules and their heavy route-only dependencies are absent from the public preload graph.

**How to apply:** Verify the emitted HTML preload graph and chunk imports, not filenames alone. Record entry/shared-runtime sizes separately from route-only chunks, and confirm the route chunks load successfully in a fresh browser context.