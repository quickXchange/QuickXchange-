---
name: Global flag geometry
description: Why country and fiat flags require one authoritative square-wrapper contract across the platform.
---

Country and fiat flags must render through one fixed square wrapper with circular clipping. Responsive contexts may select a standardized square size, but must never set width and height independently. Payment-method identities also use a consistently circular, square renderer with centered proportional artwork, optical padding compensation, and a separate smaller bottom-right currency badge. Dark, low-luminance marks may need a light circular backing for legibility, but never a square backing or image recoloring.

**Why:** Legacy public and Admin styles contain high-specificity and `!important` logo dimensions and dark circular surfaces. A normal shared rule can appear correct in one surface while another adds a heavy navy disk, clips the mark, or pushes its badge outside the stack. A later cross-artifact Payment Method requirement explicitly replaced the earlier no-circle footprint and requires readable artwork in both themes.

**How to apply:** Keep the flag geometry stylesheet loaded after product styles and preserve enough specificity for flags and badge sizing. Standalone flags may select a contextual `--qx-flag-size`; Payment Method artwork uses the cross-artifact renderer and must keep its own circular frame while the badge stays outside that clipped circle. Do not accidentally apply old payment-avatar image transforms or dark disks to it.