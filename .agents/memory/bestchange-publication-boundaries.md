---
name: BestChange publication boundaries
description: Product scope and truthful-rate decisions for the Manual Swap monitoring feed.
---

BestChange uses live Manual Swap pricing, not an independently entered rate book. Keep this work read-only: do not change WhiteBIT, monitoring, deposits or order lifecycle, and do not publish as part of verification.

**Why:** The user selected live Swap pricing and explicitly restricted the financial and publishing scope.

**How to apply:** Reuse the executable Swap quote boundary without availability bypasses. Test without real orders or shared provider-state mutations.

Classic BestChange XML cannot describe a stepped price table. Its single advertised ratio must not promise more than an executable Swap payout anywhere in the advertised source interval, including fixed fees and rounding. Commissions already included in the ratio must not be charged again through optional fee tags.

**Why:** Publishing an attractive sample-amount rate can overstate payouts elsewhere in a tiered or fixed-fee interval.

**How to apply:** Preserve conservative full-fee range pricing unless the user explicitly requests a richer BestChange format. Payment/network codes and payout reserves are explicit operator declarations; never infer them from names or invent wallet/bank balances.