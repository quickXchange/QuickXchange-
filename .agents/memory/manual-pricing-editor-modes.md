---
name: Manual pricing editor modes
description: Interpretation of exclusive Admin modes for manual pricing paths and ranges.
---

Adding Range and Edit Path are mutually exclusive editing views for a single manual pricing rule. Choosing one must not erase unsaved or persisted values owned by the other. Rule-level minimum and maximum quantity limits are shared across both views; individual tier boundaries belong to Adding Range only.

**Why:** Removing the inactive mode's data would silently change customer pricing or route eligibility merely because an operator switched views. Operators also need to set path quantity limits while adding ranges, without confusing them with a tier's amount boundaries.

**How to apply:** Keep independent tier draft state, expose the same rule-level quantity controls in either view, and preserve inactive tier values. Route-level quantity limits continue to use the existing pricing rule boundaries; tier min/max amounts remain separate.