---
name: Optional refund destinations
description: Validation and presentation rules for optional refund addresses across exchange channels.
---

Refund destinations are optional in every Swap and Convert channel. An empty address must not block quote or order creation. When a crypto refund address is supplied, validate it against the sending asset/network, never the payout network. Require and validate a memo/tag only when an address is present and the sending network requires one; reject a memo without an address.

**Why:** Refund funds return to the source side. Treating the destination network as authoritative can accept an unusable address, while making the field required would unnecessarily block valid exchanges.

**How to apply:** Keep web, Telegram, customer tracking/history, and Admin projections aligned. Show the sending identity near the input, persist the optional values, and display “Not provided” without a copy action when absent.