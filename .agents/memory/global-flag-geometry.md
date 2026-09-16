---
name: Global flag geometry
description: Why country and fiat flags require one authoritative square-wrapper contract across the platform.
---

Country and fiat flags must render through one fixed square wrapper with circular clipping. Responsive contexts may select a standardized square size, but must never set width and height independently. Payment-method identities use one transparent, borderless 48px footprint with no forced circle, clipping, ring, background, glow, reflection, bevel, inset highlight, or depth shadow. Their image uses centered proportional contain fitting with 5px internal padding so the complete source logo remains visible; their flag badge is a transparent, borderless 14px overlay inset 5px from the bottom-right edge.

**Why:** Legacy public and Admin styles contain high-specificity and `!important` logo dimensions and dark circular surfaces. A normal shared rule can appear correct in one surface while another still adds a heavy navy disk, clips the real mark, or pushes its badge outside the stack.

**How to apply:** Keep the flag geometry stylesheet loaded after product styles and preserve enough specificity for its dimensions, transparent surfaces, proportional image fit, badge inset, and stacking rules to remain authoritative. Standalone flags may select a contextual `--qx-flag-size`; payment, crypto, and network logo wrappers must stay transparent and non-clipping while source artwork remains unchanged.