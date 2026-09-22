---
name: Polygon USDT0 identity boundary
description: Current Polygon stablecoin identity and the safe boundary for the existing USDT route.
---

Use a separate Polygon route whose immutable identity makes USDT0 explicit, while the Widget may present that route as customer-facing `USDT` / `Polygon`. Preserve the former USDT route only for historical references and exclude it from new selections.

**Why:** Polygon and USDT0 sources state that the former Polygon PoS child asset was upgraded to Polygon-native USDT0. The product decision is to keep the familiar USDT label for customers without weakening the exact on-chain identity boundary.

**How to apply:** Keep the route ID and monitor contract tied to USDT0, keep the public presentation alias limited to the Widget, and never use the legacy route for new selections. Reverify code, symbol, decimals, and real logs before identity changes.