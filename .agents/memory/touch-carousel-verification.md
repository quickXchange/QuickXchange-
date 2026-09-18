---
name: Touch carousel verification
description: How to validate horizontal carousel gestures without misdiagnosing mobile vertical scrolling.
---

Validate mobile carousel gesture contracts in a touch-enabled browser context using genuine touch events. A mouse drag at a narrow viewport does not exercise native touch scrolling or `touch-action`.

**Why:** Mouse-drag simulation can falsely report that a carousel blocks vertical mobile scrolling even when real touch input correctly passes the gesture to the page.

**How to apply:** Confirm `pointerType` is `touch` and the context exposes touch points before evaluating horizontal swipe handling or vertical page-scroll behavior.