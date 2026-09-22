---
name: EVM receipt scan efficiency
description: Preserve successful-transaction proof without requesting a receipt for every transaction in busy EVM blocks.
---

For native EVM monitoring, scan small progress-safe block ranges with bounded parallel full-block reads. First parse transactions for watched-recipient candidates, then request receipts only for those candidates. Accept evidence only when the requested height, returned block, transaction, and successful receipt all agree on block identity.

**Why:** Fetching a receipt for every transaction in each BSC block made a small bounded scan hold its lease for minutes. Later, serial full-block reads over a large range exhausted the shared cycle deadline; failures retried the whole range without advancing the cursor, stranding real native deposits beyond it.

**How to apply:** Keep native ranges small enough to complete within one lease cycle, parallelize block reads under an explicit provider-safe limit, and advance the cursor only after the entire bounded range succeeds. Keep regression tests for receipt prefiltering, concurrency limits, range bounds, and mismatched block identity.