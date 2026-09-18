---
name: Popular-pair ranking boundaries
description: Defines safe dynamic popularity ranking, route validation, fallback generation, and landing-page caching.
---

Popular Convert and Swap routes must be ranked separately from recent completed orders, excluding uncertain and explicitly marked test orders. Intersect ranked identities with current executable or priced route catalogs before display.

**Why:** A static shortcut list becomes stale, but calculating popularity on every landing request adds database load and can expose disabled routes. Product modes also carry different route identities: Convert requires exact asset-network legs, while Swap requires exact settlement option IDs.

**How to apply:** Cache a bounded recent-history aggregation, serve stale data while refreshing in the background, and fill sparse rankings only from currently enabled route combinations. Keep test-order exclusion explicit in persisted data rather than guessing from customer fields. Hydrate clicked cards using exact network or settlement-option identities.