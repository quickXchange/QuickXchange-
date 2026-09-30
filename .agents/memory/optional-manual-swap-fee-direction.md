---
name: Optional Manual Swap fee direction
description: User-confirmed financial meaning of optional Manual Swap fees and add-ons.
---

Optional add-ons apply to Manual Swap, including the website and Telegram Mini App. Keep the entered You Send amount unchanged; subtract selected add-ons from You Receive in the receiving currency. They do not replace existing route pricing. Convert remains separate. The separate Admin exchange fee was retired: new quotes must not charge it, even if an old stored setting is enabled. Historical order snapshots retain their original fees.

**Why:** The original example described an extra amount payable on top of You Send, but the user explicitly chose deduction from You Receive instead. These are materially different financial contracts.

**How to apply:** Preserve this direction when changing quotes, confirmation copy, funding instructions, or order accounting. Keep the total fee breakdown visible before submission and bind selected options to the server-signed quote.

An Admin change to a selected add-on after the quote was signed must invalidate order submission, not silently reprice it or accept a charge no longer enabled. A pre-retirement signed quote containing a separate exchange fee must likewise be rejected for a new order. A definitive configuration-change rejection sends the customer back to review a fresh quote. An already-created order remains safely replayable under its idempotency identity.

**Why:** The customer must receive the amount they reviewed, while submitted orders must use currently valid Admin fee settings. Repricing during creation would break signed-quote integrity, and accepting a stale add-on would ignore an operator disabling or changing it.

**How to apply:** Recheck current selected rows and the retired fee state at the order boundary inside the same serialized creation window. Preserve the original signed values only when they still match; otherwise require a new signed quote. Never transform a stale signed quote into a different amount behind the customer's back.

Admin's unsaved add-on preview is an illustrative 1:1 USD example with zero existing route pricing, not a customer quote. Convert selected add-ons through current reference rates, and show an unavailable state rather than combining unlike currencies without a rate.

**Why:** Operators need to see the independent effect of draft percentage and fixed add-on fees without suggesting that an arbitrary route's real customer rate or existing pricing has been quoted.

**How to apply:** Keep sample calculations on the server, separate them visibly from signed live quotes, and continue to subtract the resulting add-on fees from You Receive. Never include the retired exchange fee in new previews.