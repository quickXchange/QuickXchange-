---
name: Mobile widget scroll boundaries
description: Touch-scroll ownership for fixed-height Convert and Swap widgets versus their open selectors.
---

Closed Convert and Swap widget surfaces must use native `touch-action: auto` so vertical page scrolling and pinch zoom work even when gestures start on inputs, summaries, disabled controls, or selector triggers. In an open currency/payment Search overlay, only the results list is internally scrollable, but it must chain at its boundaries; the document must remain unlocked and pinch zoom must remain available.

**Why:** Fixed-height widget scrollports, modal document locks, restrictive viewport scale limits, and contained overscroll can silently trap mobile gestures or disable zoom. Native disabled controls and read-only summary surfaces may also consume touch targeting even when they have no useful interaction.

**How to apply:** Use `touch-action: auto` through the closed widget ancestor chain; a parent with `pan-y` can still block pinch gestures inside descendants. Use `pan-y pinch-zoom` on selector results, keep Search controls outside that scrollport, avoid body locks, and explicitly permit user scaling.