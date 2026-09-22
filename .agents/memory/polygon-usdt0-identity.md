---
name: Polygon USDT0 identity boundary
description: Current Polygon stablecoin identity and the safe boundary for the existing USDT route.
---

Do not bind the existing Polygon `USDT` route to the former bridged-USDT contract without explicitly reconciling the catalog to USDT0. The live contract now reports symbol `USDT0`, even though its address is unchanged.

**Why:** Polygon and USDT0 sources state that the former Polygon PoS child asset was upgraded to Polygon-native USDT0. Live Polygon Mainnet calls confirm deployed code, 6 decimals, active Transfer logs, and symbol `USDT0`, not `USDT`.

**How to apply:** Treat USDT0 as a distinct verified identity decision. Update or add the catalog route only with explicit product approval, then persist the matching monitor identity and rerun final-adapter scans. Never silently label USDT0 as USDT.