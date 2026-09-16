---
name: Stranded browser-test processes
description: Diagnosing workspace-wide slowness after browser-heavy validation.
---

After Playwright-heavy work, check for old Chromium process trees before changing application code, caches, or dependencies. Test browsers can survive completed or timed-out runs and continue consuming substantial CPU and memory.

**Why:** Long-lived Playwright renderers can starve both the Replit editor and the running preview even when HTTP response times and application workflows are healthy.

**How to apply:** Compare process age and CPU usage with server response timings. If old processes use Playwright temporary profiles and no test is active, terminate only those disposable browser trees, then verify memory, load, HTTP timings, and workflow logs.