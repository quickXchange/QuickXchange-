---
name: Exact Clerk test aliases
description: Why browser-test Clerk aliases must not match package CSS subpaths.
---

Mode-specific Clerk stubs must alias only the exact JavaScript module exports, not every path beginning with the package name.

**Why:** Tailwind resolves Clerk's theme stylesheet through Vite. A broad package-prefix alias rewrites the stylesheet import as a path beneath the stub file and breaks the entire page before the browser test can start.

**How to apply:** When adjusting Clerk browser-test stubs or Vite aliases, keep the JavaScript aliases exact and leave theme CSS subpaths on the real package.