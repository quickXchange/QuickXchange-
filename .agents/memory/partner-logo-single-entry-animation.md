---
name: Partner logo single-entry animation
description: Why the partner strip must animate without rendering copies of published entries.
---

Each enabled partner entry should have one rendered logo. The old infinite-loop marquee appended a second copy of every logo, so the two published partners appeared twice despite having one record each.

**Why:** Duplication was a rendering technique, not duplicate source data; deleting or merging records would have damaged operator-managed content without fixing the cause.

**How to apply:** Keep partner identities sourced from published Site Studio data. For continuous motion, wrap each single item only while it is completely outside the viewport rather than cloning it. Leave enough cycle length that a wrap cannot show a reset or an entirely empty strip. Explicitly created separate entries remain distinct.

The shared Partners presentation is one level horizontal row with equal transparent slots, including Admin previews. Legacy layout/container choices must not reintroduce wrapping or opaque component-added cards.

**Why:** The Owner requested a reusable presentation rule for current and future logos, not individual corrections to particular brands. Uploaded artwork and its own background must remain unchanged.

**How to apply:** Use shared responsive sizing, preserve image aspect ratios and uploaded theme variants, keep fitting rows static, and use horizontal motion or native scrolling for overflow.

Isolate DOM identities between imperatively positioned animation and static flex rendering.

**Why:** React does not track transforms written directly by an animation loop. Reusing those nodes in a static row can leave stale transforms and make logos overlap after a resize.

**How to apply:** Check transitions in both directions between fitting and overflowing widths, not only initial screenshots. Ensure animated wrappers cannot be reused as static logo slots with leftover transforms.