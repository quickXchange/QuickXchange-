---
name: Telegram Mini App identity boundary
description: Security and ownership rules for Telegram Mini App sessions and canonical exchange orders.
---

Telegram Mini Apps must authenticate by sending raw `initData` to the server for Telegram HMAC and freshness validation. Browser-supplied Telegram IDs and `initDataUnsafe` are never authoritative. The server issues a short-lived signed session tied to the existing Telegram chat identity.

**Why:** The Mini App shares financial orders, customer links, and status actions with the website and bot. Trusting browser identity or creating a parallel order store would allow ownership confusion and split the operational source of truth.

**How to apply:** Keep catalog, quote, and order creation on the canonical exchange APIs. After creation, attach the order to the authenticated Telegram identity only after verifying its existing tracking capability. Resolve linked Clerk ownership from the existing Telegram chat mapping, and keep browser preview mode read-only.