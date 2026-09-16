---
name: Navigation surface boundaries
description: Distinguishes the public site navigation from the exchange widget’s own navigation surface.
---

Treat “site menu” or “frontend menu” as the public header navigation drawer. Treat “Admin panel menu” as the Admin header’s mobile navigation drawer. Treat “widget menu” as the separate compact navigation opened from inside Swap or Convert; do not transfer presentation changes between these surfaces unless they are explicitly requested.

**Why:** Both surfaces contain similar links and hamburger controls, but they serve different interaction contexts and should not be conflated.

**How to apply:** Confirm whether the owning surface is the public header, Admin header, or exchange widget before editing navigation presentation, and keep regressions scoped to the corresponding trigger and portal/layer.

The public and Admin header drawers share one structural component and one visual row system, while each owner supplies its own links, active-route logic, permissions, and actions.

**Why:** Parallel drawer markup and Admin-only row CSS drifted in height, spacing, icon geometry, and typography even when the surfaces were intended to match.

**How to apply:** Extend the shared drawer shell for behavior or presentation changes. Keep public/Admin content generation outside it, and compare computed visual contracts when changing shared navigation styles.

The Admin drawer is phone-only below 768px. From 768px upward, Admin uses a persistent, fully labeled 260px left sidebar; do not collapse it to an icon rail or retain an active drawer layer.

**Why:** Treating iPad widths as mobile or compact tablet widths hid required navigation labels and made the main Admin navigation depend on an overlay.

**How to apply:** Build the sidebar from the same route data and active-route helper as the phone drawer. Override the complete legacy collapse contract—sidebar width, logo wrapper, link width, label truncation, overflow, and hamburger visibility—and verify iPad portrait/landscape plus laptop widths.