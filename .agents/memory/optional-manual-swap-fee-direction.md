---
name: Optional Manual Swap fee direction
description: User-confirmed financial meaning of optional Manual Swap fees and add-ons.
---

Optional add-ons and the separately configured exchange fee apply to Manual Swap, including the website and Telegram Mini App. Keep the entered You Send amount unchanged; subtract these fees from You Receive in the receiving currency. They are opt-in or independently enabled and do not replace existing route pricing. Convert remains separate.

**Why:** The original example described an extra amount payable on top of You Send, but the user explicitly chose deduction from You Receive instead. These are materially different financial contracts.

**How to apply:** Preserve this direction when changing quotes, confirmation copy, funding instructions, or order accounting. Keep the total fee breakdown visible before submission and bind selected options to the server-signed quote.

Admin's unsaved fee preview is an illustrative 1:1 USD example with zero existing route pricing, not a customer quote. Convert selected add-ons and fixed fees through current reference rates, and show an unavailable state rather than combining unlike currencies without a rate.

**Why:** Operators need to see the independent effect of draft percentage and fixed fees without suggesting that an arbitrary route's real customer rate or existing pricing has been quoted.

**How to apply:** Keep sample calculations on the server, separate them visibly from signed live quotes, and continue to subtract the resulting fees from You Receive.