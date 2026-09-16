---
name: Layered mobile CSS overrides
description: How cascade-layer precedence affects mobile layout overrides in the public widget stylesheet.
---

When a mobile layout rule appears correct in source but has no effect, verify both cascade-layer precedence and that the rule actually sits inside the intended breakpoint. For important declarations, cascade-layer priority is inverted, so a layered rule can also retain control over later overrides.

**Why:** Large layered stylesheets have produced two deceptive failures: an older important declaration retaining precedence, and a phone fix accidentally landing in a tablet-only media block. Both looked correct near the end of the file but did not affect computed mobile styles.

**How to apply:** When mobile geometry disagrees with the newest rule, inspect computed/matched declarations and confirm the active media query. Prefer correcting the owning source rule or breakpoint instead of stacking blind overrides. For fixed-height shells, verify computed padding and gaps as well as total height: otherwise added height can collect as empty space below the last row. If a shared base selector gains a parent qualifier, mirror that specificity inside its breakpoint override; otherwise the desktop rule can still win on phones. If a final override is necessary, match the full viewport/layer/card selector chain so older important geometry cannot retain control.

For compact variants of globally fixed-size logo wrappers, overriding `width` and `height` is insufficient when the global contract also sets important min/max dimensions.

**Why:** A carousel-specific 26px logo rule appeared partly successful—the width and artwork changed—but an important 48px minimum height kept the wrapper taller than its 44px card.

**How to apply:** Override width, height, min-width, min-height, max-width, max-height, flex basis, padding, and overflow together in the owning cascade layer. Confirm the wrapper and artwork bounding boxes, not only visible clipping.