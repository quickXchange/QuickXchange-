---
name: Amount-independent route rates
description: Defines how Swap presents a selected route's exchange rate before the customer enters an amount.
---

The public Swap rate card should show an amount-independent reference rate for every selected payment route before an amount-based quote exists.

**Why:** Customers want to compare rates across payment routes before entering an amount. A fixed fee can still make the eventual effective quote rate differ from this pre-amount reference.

**How to apply:** Before an amount is entered, derive the selected route’s reference rate directly from the full-precision source/target market ratio and percentage markup, without fixed fees. Do not obtain it by quoting one source unit: target atomic-unit rounding can materially distort low-precision fiat rates. Once an amount-based quote exists, replace the reference with that quote’s effective receive-per-source-unit rate.