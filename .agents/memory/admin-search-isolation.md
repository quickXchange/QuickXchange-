---
name: Shared Admin search isolation
description: Keeps the reusable Admin search contract identical across route-specific and responsive CSS.
---

The shared Admin search owns its height, padding, border, focus treatment, typography, and icon geometry. Generic Admin form rules and responsive toolbar input rules must exclude it rather than restyling it by route.

**Why:** High-specificity generic focus rules and a mobile toolbar minimum height can silently override a reusable search even when its stylesheet loads later. Focus transitions also expose intermediate computed colors during browser assertions.

**How to apply:** When adding global input or toolbar CSS, explicitly leave the shared Admin search class out. In visual tests, assert each owned dimension directly and poll for the settled focus color after the transition.