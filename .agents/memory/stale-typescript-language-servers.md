---
name: Stale TypeScript language servers
description: Diagnosing editor-wide slowness when application services and browser-test cleanup are healthy.
---

**Rule:** When Replit is broadly slow but load, disk, app response times, and Playwright processes are healthy, inspect the age, CPU, and resident memory of the TypeScript language-server tree.

**Why:** A long-lived analysis tree can retain over a gigabyte of memory and sustained CPU after extensive frontend edits, slowing the workspace without making the website itself slow.

**How to apply:** Restart only the stale language-server parent and its children, then confirm memory recovery and app health. Do not restart healthy application workflows or purge useful project caches as a first response.