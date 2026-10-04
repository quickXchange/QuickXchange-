---
name: Performance measurement safety
description: Prevent diagnostic tooling from creating failures or silently undercounting Development browser resources.
---

Increase the browser resource timing buffer before navigation when measuring the Development frontend.

**Why:** Large Vite module graphs can exceed the default resource timing buffer. Later API and image entries are then missing even though the requests completed, making payload totals and request counts misleading.

**How to apply:** Use a sufficiently large buffer in a browser initialization script and cross-check timing entries against network request events.

Treat diagnostic-hook failures separately from application performance failures.

**Why:** An incomplete React DevTools hook broke Fast Refresh; the Development runtime error overlay then attempted to read a virtual module and crashed Vite. That navigation was not a valid baseline.

**How to apply:** Obtain an ordinary browser baseline first. Any React hook must support renderer registration and the renderer Map used by Fast Refresh. Discard probe-induced failures rather than attributing them to the original slowdown.

Compare process CPU, thread CPU, and JavaScript profiles rather than equating them.

**Why:** Background V8 and libuv threads can consume substantial CPU while the main JavaScript profile shows considerable idle time.

**How to apply:** Report CPU percentages relative to one core and keep worker-specific attribution limited to observed stacks and workload evidence.