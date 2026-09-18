---
name: Pricing adjustment directions
description: Durable calculation, rounding, snapshot, and reporting rules for markup versus customer benefit pricing.
---

Pricing rules use an explicit `MARKUP` or `GIVE_MORE` direction with a nonnegative percentage magnitude. Existing rules default to `MARKUP`.

**Why:** A negative markup is ambiguous in operator interfaces and accounting. Explicit direction keeps customer economics, signed quote evidence, and revenue reporting consistent.

**How to apply:** Calculate gross market value first. Markup subtracts a ceiling-rounded percentage and fixed fee. Give more adds a floor-rounded percentage and then subtracts the fixed fee. Signed snapshots record direction and rounding. Revenue reports customer benefit as a subsidy: fixed fee minus bonus.