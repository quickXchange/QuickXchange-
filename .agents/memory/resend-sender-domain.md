---
name: Resend sender domain verification
description: Sender-domain constraint for QuickXchange transactional email.
---

The connected Resend credential is send-only and cannot list domains. Resend rejects every sender on `quickchange.exchange` until that domain is verified in the same Resend account.

**Why:** The project owner confirmed `quickchange.exchange` is the authoritative domain; both support and notification email must use it. Resend still requires verification in the connected account.

**How to apply:** Keep contact delivery fail-closed. Verify `quickchange.exchange` in Resend before live email tests; do not substitute the Resend test sender for production customer mail.