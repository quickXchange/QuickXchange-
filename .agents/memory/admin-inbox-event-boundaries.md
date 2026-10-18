---
name: Admin inbox event boundaries
description: Why in-app operational notifications are independent of outbound channels and operator dismissals.
---

The in-app inbox is an operational channel independent of the existing email/Telegram delivery switches. Turning off external messages must not remove operators' visibility into new orders and service failures.

**Why:** Reusing outbound-channel settings would suppress durable operational alerts when an Owner merely opts out of email or Telegram.

**How to apply:** Integrate new events through canonical backend lifecycle/evidence paths, not UI page visits or outbound sender success. Do not infer paid milestones from a status label. Keep dismissals operator-specific and retain shared event identity so replay cannot recreate a dismissed alert. Provider-error summaries must not retain raw requests, responses, credentials, customer payment details or URLs.
