---
name: Admin order network labels
description: Display contract for crypto networks in Admin Convert and Swap order tables.
---

Admin Convert and Swap order rows must show crypto assets with one concise route-network code, such as BEP20, ERC20, or TRC20. Do not combine the descriptive network title with the route code or repeat the long route title underneath.

**Why:** Combined labels such as “BNB Smart Chain · BEP20” are noisy and consume excessive table width; operators prefer the unambiguous standard route code in Convert lists.

**How to apply:** Derive the display label without changing stored order data. Prefer the settlement option’s route-network value and normalize common token-standard codes. Fiat payment methods retain their descriptive labels.