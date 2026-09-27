---
name: Manual pricing editor modes
description: Interpretation of exclusive Admin modes for manual pricing paths and ranges.
---

Adding Range and Edit Path are mutually exclusive editing views for a single manual pricing rule. Choosing one must not erase unsaved or persisted values owned by the other. Range editing retains its existing behavior; Edit Path changes rule-level quantity limits, not tier boundaries.

**Why:** Removing the inactive mode's data would silently change customer pricing or route eligibility merely because an operator switched views. The operator asked to choose one editor, not to discard the other configuration.

**How to apply:** Keep independent draft state and submit only intentional changes to the active view while preserving inactive values. Route-level quantity limits continue to use the existing pricing rule boundaries.