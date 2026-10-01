---
name: Partner marquee presentation
description: Count-independent readable partner logos and seamless visual repetition without duplicate source records.
---

Partner logos must remain large and readable independently of partner count. Short lists still move continuously; fitting the whole list on screen is not a goal. Repeat the visual sequence when necessary for a seamless, equally spaced loop, but never duplicate Admin records.

**Why:** The Owner explicitly rejected the earlier shrink-to-fit/static-row approach because it made logos too small and stopped the marquee. This supersedes the older single-rendered-entry restriction. Source duplication and visual loop repetition are different; deleting source entries would damage operator-managed content.

**How to apply:** Keep published Site Studio data authoritative. More partners extend the moving row, never reduce logo size. Keep visual copies out of the accessibility tree and keyboard sequence while retaining visible link behavior. Check equal spacing through the seam, swipe followed by automatic resume, and explicit Pause/Play separately.

The shared Partners presentation is one level horizontal row with equal transparent slots, including Admin previews. Legacy layout/container choices must not reintroduce wrapping or opaque component-added cards.

**Why:** The Owner requested a reusable presentation rule for current and future logos, not individual corrections to particular brands. Uploaded artwork and its own background must remain unchanged.

**How to apply:** Preserve image aspect ratios and uploaded theme variants in equal-height transparent containers. Keep automatic movement even for short lists, while respecting reduced-motion preferences and intentional static Admin previews.

Isolate DOM identities between imperatively positioned animation and static flex rendering.

**Why:** React does not track transforms written directly by an animation loop. Reusing those nodes in a static row can leave stale transforms and make logos overlap after a resize.

**How to apply:** Check transitions in both directions between fitting and overflowing widths, not only initial screenshots. Ensure animated wrappers cannot be reused as static logo slots with leftover transforms.