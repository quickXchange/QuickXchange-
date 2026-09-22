---
name: BSC legacy readiness boundary
description: Why the historical BEP20 readiness exception must never authorize token deposit routes.
---

Canonical BSC Mainnet monitors (`chainId = 0x38`) always require fresh network and exact-route readiness proofs for native BNB and BEP20 tokens. The legacy exception applies only to older noncanonical BEP20 monitor records, and only to an enabled native BNB identity with no contract address.

**Why:** A network-code-only exception let canonical BSC order creation bypass exact proof checks after configuration invalidation. Older native BNB behavior still needs compatibility without weakening current BSC or any token route.

**How to apply:** Pass chain ID into every listing, setup, and order-time readiness check. Refresh strict BSC proofs during fenced scheduler cycles. Never authorize canonical `0x38` BSC or a token route by network code alone.