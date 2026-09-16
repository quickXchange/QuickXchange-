---
name: Stable exchange shell
description: Fixed outer sizing and no-scroll primary-form contract for the shared Swap and Convert widget.
---

The Landing and Customer Dashboard exchange widgets keep one stable outer footprint at each breakpoint. Primary Swap and Convert forms should fit without scrolling when practical. When a required payment-field set cannot fit, only the field list may scroll; the route summary, terms, and submit action remain fixed and visible. Open selector result lists retain their own scrolling.

**Why:** Mode-specific natural heights made the premium panel jump, while short fixed shells hid the rate or submit action. Universal payment fields can exceed the available shell height, so a bounded field-list scroll is safer than clipping controls or moving submission outside the card. Layered shared input/button dimensions can silently defeat later compact overrides.

**How to apply:** Keep normal Swap and Convert forms at the same breakpoint height, width, padding, radius, border, and glow. Compact long steps first. If the field set still cannot fit, constrain scrolling to the field-list region and keep terms and submit outside it. Active terminal availability states are the mobile exception: release the viewport, active layer, and card height together so short notices do not leave hundreds of pixels empty. Verify every field and recovery action remains keyboard reachable and hit-testable. Update the final owning rules when layered or later important declarations conflict.