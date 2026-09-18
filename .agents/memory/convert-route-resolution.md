---
name: Unified Convert route resolution
description: Keeps Convert catalogs, popular routes, selectors, quotes, and order creation aligned on exact asset-network availability.
---

All Convert surfaces must derive availability from one resolver over currently executable asset-network capabilities. A route is an exact directed source instrument to a different exact destination instrument; same-symbol cross-network routes remain valid.

**Why:** The Convert widget accepted capability combinations while the Crypto Pairs page read an intentionally empty embedded pair list, and Popular Pairs generated its own combinations. These separate interpretations made available routes disappear or disagree across surfaces.

**How to apply:** Use the shared resolver for complete or source-filtered route catalogs, Popular Convert filtering/fallbacks, and quote/order route assertions. Preserve exact network identity in links and UI keys. Treat successful live quote creation as the final rate check because rate availability is amount- and time-dependent. Invalidate dependent caches after successful Admin capability or credential changes.