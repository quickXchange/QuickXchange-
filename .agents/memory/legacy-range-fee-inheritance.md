---
name: Legacy range fee inheritance
description: Compatibility rule for manual Swap pricing ranges created before per-range fixed fees.
---

Ranges saved before per-range fixed fees existed omit that property. An omitted fee must inherit the existing rule's base fixed fee; an explicitly saved zero means no fee for that range. Outside configured ranges, the rule's base percentage, direction, and fixed fee continue to apply. Preserve omission across snapshots, workspace sync, and unrelated edits rather than silently converting old ranges to zero.

**Why:** The operator simplified the fee editor without asking to reprice existing rules or change quotes outside configured ranges. Treating historical omissions as zero would change customer payouts.

**How to apply:** Use the selected range's fixed fee only when present, otherwise the base rule fee. Keep signed quote calculations and Admin display aligned with this distinction. New ranges should save an explicit fee.