---
name: Legacy range fee inheritance
description: Compatibility rule for manual Swap pricing ranges created before per-range fixed fees.
---

Historical ranges saved before per-range fixed fees existed omit that property. In legacy mixed pricing, an omitted fee inherits the rule's base fixed fee; explicit zero replaces it, and gaps use the base percentage, direction, and fee. New range-only mode is different: the inactive path fee must not leak into a range or a gap. Preserve legacy omissions across snapshots, workspace sync, and unrelated edits rather than silently converting old ranges to zero.

**Why:** The operator simplified the fee editor without asking to reprice existing rules or change quotes outside configured ranges. Treating historical omissions as zero would change customer payouts.

**How to apply:** Apply inheritance and base fallback only to historical mixed-mode rules. In range-only mode, missing range fees and gaps have zero path fee. Keep signed quote calculations and Admin display aligned with this distinction. New ranges should save an explicit fee.