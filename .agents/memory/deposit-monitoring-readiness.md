---
name: Deposit monitoring readiness
description: Safety boundary for exposing and creating Manual Swap customer-deposit routes.
---

Customer deposits require an exact asset-network monitor identity, a supported adapter/provider pair, valid chain-specific identity and wallet data, a stable digest of current route/network configuration (including hashed resolved endpoint material), and a fresh connected health attestation. An unhealthy route may remain available for customer payouts, but it must not remain a deposit source.

**Why:** Network-level health alone can incorrectly authorize sibling assets. Proofs based only on timestamps, or generated from the pre-save address, become invalid after commit; proofs not recomputed from current secrets survive endpoint rotation. Removing the route entirely also breaks payouts that do not depend on inbound monitoring.

**How to apply:** Probe outside transactions, then lock and revalidate the exact catalog route, monitor network, and monitor asset before enabling deposits. A disabled exact asset monitor is blocked even when its network and proofs are healthy. Preview and apply must evaluate the same effective route state, while apply repeats the lock-time checks. Store stable configuration digests separately from freshness timestamps. Scheduler and verifier must share one canonical network digest, and each verified scheduler cycle must refresh the network proof and any established exact-route proof atomically. Recompute both at public source selection and inside the order transaction, including legacy signed quotes. Keep receive-only presentation independent from deposit readiness.