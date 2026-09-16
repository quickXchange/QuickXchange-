---
name: Tablet hero track balance
description: How to balance a fixed exchange widget and hero content in a tablet-only two-column layout.
---

In a tablet two-column hero, size the fixed-widget track as a percentage with a desktop-width cap rather than relying on a large `minmax()` maximum. On portrait tablets, keep the two columns but stack dense feature and action groups within the narrower content rail.

Treat desktop-mode iPads as tablets through their touch capability even when their CSS viewport is wider than the normal tablet breakpoint. Do not widen the breakpoint for ordinary pointer-based laptops.

**Why:** Grid track sizing can select a generous widget maximum at the smallest tablet width and leave the content rail unusably narrow. Geometry checks may still pass while labels wrap character-by-character or actions clip; a real portrait screenshot exposes this.

**How to apply:** At tablet-only breakpoints, cap the widget track proportionally, retain comfortable outer and inter-column gaps, and switch compact two-across content groups to one column only where their measured rail is too narrow. Extend wider desktop-mode iPad coverage with a coarse/available-touch pointer condition, and keep a non-touch desktop regression at a nearby width. Verify both breakpoint geometry and the rendered portrait composition.