---
name: Browser fixture contract completeness
description: Avoid misleading Admin browser failures when dialog dependencies or response fields are absent from mocks.
---

When a browser test opens a privileged dialog, mock every endpoint the dialog reads and return the complete current success response shape. A route's support status and its provider mapping status are distinct; neither substitutes for the other.

**Why:** An unmocked permission-status request fell through to an unauthorized response that a client treated as data, crashing the dialog. A partial route preview then made supported routes appear unselectable. Both looked like UI regressions while the real issue was incomplete test setup.

**How to apply:** Inspect all queries used by the opened dialog, mock read-only statuses explicitly, and make preview fixtures include both execution eligibility and exact mapping metadata. Keep user-visible assertions and normal click behavior rather than forcing clicks or skipping the flow.