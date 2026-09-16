---
name: Admin portal theme surfaces
description: Theme and cascade rules for Admin menus rendered outside the Admin shell.
---

Admin profile menus, Radix dropdowns, and nested selector overlays must receive explicit theme-aware surface, text, icon, separator, destructive-action, and active-toggle styling rather than relying on Admin shell variables or unconditional dark surfaces.

**Why:** Portaled menus do not inherit token overrides from the Admin shell. Legacy mobile rules can also use `:is()` selectors whose highest-specificity branch beats a later-looking Light Mode override, leaving only phones on the dark surface.

**How to apply:** Give Admin-only overlay families stable classes, use token-based Light Mode surfaces by default, and scope near-black backgrounds and dark shadows under `.dark`. Compare selector specificity against every `:is()` branch at phone widths, then verify theme changes while the same menu remains open.