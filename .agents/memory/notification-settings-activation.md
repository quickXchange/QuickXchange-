---
name: Notification settings activation
description: Saving disabled notification channels without losing configuration or weakening connection ownership.
---

Delivery requirements apply only when a channel's existing notification policy enables at least one event, accounting for its master switches. A remembered channel preference can remain ON while all of its events are OFF. Admin recipient validation belongs to Admin email, not customer email; Telegram contact checks belong only to active Admin Telegram.

**Why:** Requiring a chat solely because the remembered Telegram switch was ON prevented the Owner from saving all-events-OFF settings. Inactive or unconfigured delivery must not block unrelated settings updates.

**How to apply:** Reuse the established event-policy predicates when validating configuration, rather than inventing a second delivery definition. Keep structural and unrelated URL validation intact. Do not alter order event enqueue/delivery policy to fix the settings editor.

Disabling channels preserves stored contact details and verified Telegram identity. A settings form cannot assign or restore the trusted chat ID; only the connection flow can do that.

**Why:** Operators need to disable notifications without losing setup, while stale forms must never reconnect a chat that was explicitly disconnected.

**How to apply:** Persist the requested switches and contact edits, ignore form-supplied trusted chat IDs, and reload the saved settings. Surface the backend's actual validation message through the standard Admin action toast.