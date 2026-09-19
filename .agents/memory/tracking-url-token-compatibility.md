---
name: Tracking URL token compatibility
description: Canonical and backward-compatible URL rules for customer order tracking.
---

Customer tracking links must emit the signed capability as `trackingToken` and the order ID as `order`. The tracking page should also accept the historical `token` alias, but all newly generated links use the canonical name.

**Why:** Rewriting the token parameter between Step 3 and the tracking page can silently drop access to protected order details, especially on refresh or direct URL entry. Search-only React state also disappears on refresh.

**How to apply:** Build Step 3 links from the current order response ID and token, parse `trackingToken` before the legacy alias, and update the tracking URL whenever a user submits an Order ID. Manual, provider, Admin, and Telegram views must continue referencing the same persisted order ID.