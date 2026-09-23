---
name: Bounded blockchain catch-up
description: Safety and fairness rules for increasing lagging EVM monitor throughput without weakening payment evidence.
---

Lagging EVM watches may process multiple provider-safe block ranges in one worker cycle, but every range remains independently bounded and the entire cycle has a finite deadline and work budget.

**Why:** A single bounded range per poll can lose ground when the chain advances faster than the polling interval. Increasing the RPC range itself risks provider rejection and unsafe load, while unbounded post-scan confirmation or application work can silently defeat the cycle deadline.

**How to apply:** Advance a watch cursor only after that range’s evidence is durably persisted and the lease-fenced compare-and-set succeeds. Isolate watch failures, bound and fairly rotate confirmation/application batches, and revalidate terminal orders transactionally before deactivating their watches.