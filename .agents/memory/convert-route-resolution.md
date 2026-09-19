---
name: Unified Convert route resolution
description: Keeps Convert catalogs, popular routes, selectors, quotes, and order creation aligned on exact asset-network availability.
---

All Convert surfaces must derive availability from the intersection of currently executable asset-network capabilities and Quickex's active directed pair catalog. Never generate a Cartesian product of instruments. A route is an exact directed source instrument to a different exact destination instrument; same-symbol cross-network routes remain valid.

**Why:** The Convert widget accepted capability combinations while the Crypto Pairs page read an intentionally empty embedded pair list, and Popular Pairs generated its own combinations. These separate interpretations made unavailable Quickex networks appear selectable and made surfaces disagree.

**How to apply:** Use the shared resolver for configuration, source and target selectors, Popular Convert filtering/fallbacks, and quote/order route assertions. Filter instruments to pair participants and targets to the selected source's directed pairs. Preserve exact network identity in links and UI keys. Treat successful live quote creation as the final rate check because rate availability is amount- and time-dependent. Fence cache resets so older pair refreshes cannot repopulate stale routes. Invalidate dependent caches after successful Admin capability or credential changes.