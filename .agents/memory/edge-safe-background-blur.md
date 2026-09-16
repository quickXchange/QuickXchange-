---
name: Edge-safe background blur
description: How to blur cover-positioned artwork without transparent edge fade or focal crop drift.
---

For responsive artwork using `background-size: cover` and percentage focal positions, keep the painted element’s box unchanged and blur it with a filter that duplicates edge pixels.

**Why:** Expanding the painted box changes the coordinate space used by `cover` and percentage positioning, while ordinary CSS blur can sample transparency beyond the image boundary and create visible edge fade. An SVG Gaussian blur with duplicated edges avoids both problems.

**How to apply:** Give each mounted artwork instance unique responsive filter definitions, switch them at the same breakpoint as the placement profile, and verify maximum blur at neutral zoom has the same image and wrapper bounds.