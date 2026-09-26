---
name: Drawer browser verification
description: Stable geometry and click assertions for animated, portaled drawers in customer browser tests.
---

Measure drawer geometry only after its entry animation finishes. An element can already be visible while its right edge is still moving.

**Why:** An immediate geometry assertion saw an in-between position. A separate delayed, page-level affiliate notice then intercepted clicks on tabs after the drawer closed, even though the notice was absent at initial navigation.

**How to apply:** Await the drawer's active animations before exact rectangle checks. Before clicking controls under a drawer, dismiss any late-arriving global notice through its actual close button; do not force clicks or mask the overlay with CSS in the test.