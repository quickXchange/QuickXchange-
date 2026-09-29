---
name: Cross-surface network badges
description: Keep network artwork circular and consistent without forcing identical host layouts.
---

The website and Telegram Mini App must share one network artwork badge treatment. Configured asset-and-network logo URLs take priority; known network-code fallbacks are visual safety nets, never a reason to infer a network from the asset. Unrecognized future networks without artwork use an honest fallback rather than an unrelated chain logo. Payment-method currency/flag badges remain source-driven and should not appear for every EUR route automatically.

**Why:** Independent badge implementations drifted in shape, cropping, sizing, and dark-mode contrast. Orders can outlive a catalog row, so historical projections and verified network identity must not be replaced by a guessed logo. Existing host designs use different surrounding text and placement; imposing one entire identity layout would redesign unrelated surfaces.

**How to apply:** Reuse the shared circular artwork primitive while leaving the main logo and host layout unchanged. Supply the current route's configured network image when available; use the network code only for a known visual fallback. Preserve the host's choice of placement and contextual badge diameter, and ensure the actual network image uses proportional containment inside a filled circular backing with a thin theme-safe edge.