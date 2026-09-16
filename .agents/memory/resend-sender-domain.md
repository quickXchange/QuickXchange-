---
name: Resend sender domain verification
description: Sender-domain constraint for QuickXchange transactional email.
---

The connected Resend credential is send-only and cannot list domains. Resend rejects every sender on `quickxchange.net` until that domain is verified in the same Resend account.

**Why:** Both the explicit Contact Form sender and the configured notification sender resolved to `quickxchange.net` and were rejected with the provider's unverified-domain response.

**How to apply:** Keep contact delivery fail-closed. Verify `quickxchange.net` in Resend before live email tests; do not substitute the Resend test sender for production customer mail.