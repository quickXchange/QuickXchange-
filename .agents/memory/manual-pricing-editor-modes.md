---
name: Manual pricing editor modes
description: Interpretation of exclusive Admin modes for manual pricing paths and ranges.
---

Adding Range and Edit Path are mutually exclusive *active pricing modes* for a manual pricing rule. Save the chosen mode so it also controls customer quotes. Switching modes must not erase persisted values owned by the inactive mode. Path-level minimum and maximum quantity limits belong to Edit Path and do not apply in range-only mode; individual tier boundaries belong to Adding Range only. Historical mixed-mode rules retain their existing limit behavior until the operator selects range-only.

The exact rate is the shared base conversion rate, including when Adding Range is active. In that mode, path markup and path fixed fees are inactive; a configured range's own percentage, direction, and fixed fee determine its pricing. Outside configured ranges, new range-only rules use the unadjusted base rate, not inactive path charges. Historical range rules retain their existing fallback and omitted-fee behavior until an operator explicitly saves the new mode.

**Why:** The operator clarified that the unselected mode must be off in the widget, but explicitly confirmed that Adding Range should keep using the exact base rate. Deleting inactive values or silently changing historical gap prices would misprice existing routes.

**How to apply:** Preserve inactive fields, persist active mode separately from tier data, show the effective percentage/fee rather than an inactive path percentage, and enforce path-level quantity limits only outside range-only mode. Separate payment-method limits still apply in either mode. Tier min/max amounts remain separate.