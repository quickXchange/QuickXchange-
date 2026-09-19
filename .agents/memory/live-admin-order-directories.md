---
name: Live Admin order directories
description: Freshness rule for operator order lists updated by website, Telegram, and background actors.
---

Authenticated Admin financial order-directory responses must be private and non-cacheable, and every list consumer needs a refetch path on mount, focus, reconnect, and an appropriate polling interval.

**Why:** Orders can be created by Telegram or another session. A correctly persisted row is still operationally invisible if the browser or an intermediary reuses an older directory response.

**How to apply:** Use explicit `private, no-store` response headers for operator order queues. Configure dashboard summaries and full order lists to request fresh data without relying on the writer to update their caches.