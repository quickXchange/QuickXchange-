---
name: Signed settlement snapshot parity
description: Keep manual quote funding snapshots structurally identical during order revalidation.
---

Build signed funding instructions and their current-state revalidation value through one canonical projection.

**Why:** Adding provider policy to quote creation but not the duplicated revalidation object made every unchanged order fail with `SETTLEMENT_OPTION_CHANGED`.

**How to apply:** When funding terms gain or change a field, update the shared projection and test both outcomes: unchanged terms create an order, while a real post-quote mutation remains rejected.