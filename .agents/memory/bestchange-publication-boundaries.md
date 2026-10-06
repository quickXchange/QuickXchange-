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

Manual Pricing directions should appear automatically in BestChange, including future routes. Publish ready routes and keep incomplete routes visible as pending setup; preserve explicit operator disable switches.

**Why:** The user requested automatic inclusion of any Manual Pricing direction and chose “Publish ready routes; keep incomplete ones pending.”

**How to apply:** Expand wildcard pricing into concrete Manual Swap directions. Reuse only unambiguous operator declarations for the same immutable settlement option; do not guess official codes, payout reserves, limits or cash cities. Keep unavailable exact paths visible without treating their metadata as execution permission.

Adding directions to BestChange must be checked against the actual production XML, not just the Admin direction list.

**Why:** The user reiterated that directions must appear at the live XML link and said the work was not done when the feed remained empty.

**How to apply:** Distinguish code deployment from production configuration. Check the live XML items and production mapping/reserve readiness, and state any remaining blockers explicitly instead of claiming the public directions are available.

Fiat payout reserves approved in Workspace do not become live through a code deployment. Move only the declared, positive, matching reserves through an Owner-reviewed production transfer; never use a broad configuration sync as a shortcut. The user confirmed that the eligible Workspace payment-method reserves of 400,000 each were accurate to advertise on 2026-10-06. This approval is not a standing claim about future balances.

**Why:** Production still held zero reserves while Workspace had positive ones. A broad sync would also change unrelated financial and operational settings; public reserve claims must reflect the reviewed values.

**How to apply:** Export only currency/payment-method identities and reserve decimals, preview differences against currently enabled production methods, and fence approval against intervening balance changes. Check actual public XML after the Owner applies it; keep crypto payouts and ambiguous mappings pending.