---
name: Deposit monitoring readiness
description: Safety boundary for exposing and creating Manual Swap customer-deposit routes.
---

Customer deposits require an exact asset-network monitor identity, a supported adapter/provider pair, valid chain-specific identity and wallet data, and a fresh connected health check. An unhealthy route may remain available for customer payouts, but it must not remain a deposit source.

**Why:** Network-level health alone can incorrectly authorize sibling assets, and a previously connected status can become unsafe if monitoring stops. Removing the route entirely also breaks payouts that do not depend on inbound monitoring.

**How to apply:** Use the same fail-closed readiness decision at public source availability and order creation, including legacy signed quotes. Keep receive-only presentation independent from deposit readiness.