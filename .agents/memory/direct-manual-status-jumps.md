---
name: Direct manual status jumps
description: Defines timestamp, audit, and notification semantics when an operator skips Manual Swap lifecycle states.
---

Manual Swap status updates may jump to any later progression state, but never backward or out of a terminal state. A jump records all crossed milestone timestamps at the update time without overwriting timestamps already present. It writes one audit event listing skipped states and emits one customer notification for the selected final status, not synthetic notifications for each skipped state.

**Why:** Operators need to finish already-settled orders without repetitive saves, while operational timing, concurrency protection, audit history, and customer messaging must remain coherent.

**How to apply:** Use the same semantics for single and bulk operator updates. Keep cancellation and failure exits restricted to the states where they are already valid.