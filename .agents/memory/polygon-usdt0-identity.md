---
name: Polygon USDT0 identity boundary
description: Current Polygon stablecoin identity and the safe boundary for the existing USDT route.
---

Use a separate Polygon route whose immutable identity makes USDT0 explicit, while the Widget may present that route as customer-facing `USDT` / `Polygon`. Preserve the former USDT route only for historical references and exclude it from new selections. Strict proof refresh applies only to canonical `POLYGON` with chain ID `0x89`.

**Why:** Polygon and USDT0 sources state that the former Polygon PoS child asset was upgraded to Polygon-native USDT0. A network-code and chain-ID fence prevents the deprecated route from inheriting current proofs. Missing receiving addresses must remain blocked even when monitoring is healthy.

**How to apply:** Keep the route ID and monitor contract tied to USDT0, keep the public presentation alias limited to the Widget, and never use the legacy route for new selections. Reverify code, symbol, decimals, and real logs before identity changes; never create a readiness proof without a valid existing address.