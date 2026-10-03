---
name: BestChange publication boundaries
description: Product scope and truthful-rate decisions for the Manual Swap monitoring feed.
---

BestChange uses live Manual Swap pricing, not an independently entered rate book. Verification stays read-only: do not change WhiteBIT, monitoring, deposits or order lifecycle, and do not publish as part of verification.

**Why:** The user selected live Swap pricing and explicitly restricted the financial and publishing scope.

**How to apply:** Reuse the executable Swap quote boundary without availability bypasses. Test without real orders or shared provider-state mutations.

Classic BestChange XML cannot describe a stepped price table. Its single advertised ratio must not promise more than an executable Swap payout anywhere in the advertised source interval, including fixed fees and rounding. Commissions already included in the ratio must not be charged again through optional fee tags.

**Why:** Publishing an attractive sample-amount rate can overstate payouts elsewhere in a tiered or fixed-fee interval.

**How to apply:** Preserve conservative full-fee range pricing unless the user explicitly requests a richer BestChange format. Payment/network codes and payout reserves are explicit operator declarations; never infer them from names or invent wallet/bank balances.

For fiat destinations, the current Payment Method reserve in the receiving currency is authoritative for XML amount and shared across all directions using that destination. It is not capped by a direction's per-transaction maximum. Reserves remain informational/configurational: orders never decrement or otherwise modify them. Existing crypto-destination reserve settings are separate.

**Why:** The user requested currency-specific Payment Method reserves, automatic BestChange reuse without duplicate entry, and no order-driven balance changes.

**How to apply:** Keep currency reserves independent and exact, omit zero-reserve destinations, invalidate older feed generations after committed reserve edits, and leave publication and pricing unchanged unless explicitly requested.

Bulk Reserve applies the full entered amount separately to each selected Payment Method in its own configured currencies, never as a pooled total or a divided allocation.

**Why:** The user explicitly required individual amounts with currencies preserved, including setting zero, and no changes to other Payment Method fields.

**How to apply:** Preserve this meaning in bulk previews and mutations; never introduce currency conversion, allocation, or changes to unrelated settings.