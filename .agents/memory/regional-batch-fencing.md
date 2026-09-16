---
name: Regional batch fencing
description: Concurrency rule for applying reviewed region-based configuration batches
---

For a reviewed region-based batch, lock each target row and recheck that it still belongs to the selected region inside the same transaction as its mutation. Treat departed members as per-item conflicts, and never add currencies that were not part of the reviewed target set.

**Why:** membership can change after preview or even after an apply request rebuilds its target list. A pre-transaction check alone can mutate a currency that no longer belongs to the operator's reviewed region.

**How to apply:** bind apply requests to reviewed currency IDs and row versions, reject target-set drift, then select each target `FOR UPDATE` and verify current membership before writing.