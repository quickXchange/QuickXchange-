---
name: Ethereum strict readiness
description: Canonical Ethereum monitoring identity, proof-refresh boundary, and disabled-route treatment.
---

Refresh exact-route Ethereum readiness proofs only when the EVM monitor uses canonical network code `ERC20` and chain ID `0x1`. Match ERC-20 transfers by exact contract and immutable log identity, never symbol.

**Why:** A healthy generic EVM connection is insufficient to prove Ethereum Mainnet, and symbol matching can conflate unrelated tokens. Provider-imported API routes may share the network code while intentionally lacking manual receiving addresses and monitor identities.

**How to apply:** Fence scheduler proof refresh on adapter, network code, and chain ID together. Require exact contract and decimals for token routes and a separate native identity for ETH. Leave disabled API routes blocked unless their full manual-monitoring configuration is explicitly established.