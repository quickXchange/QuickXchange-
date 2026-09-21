---
name: Resend sender domain verification
description: Sender-domain constraint for QuickXchange transactional email.
---

The connected Resend credential is send-only and cannot list domains. Transactional support email uses `support@quickxchange.net`, while the website domain is `quickchange.exchange`.

**Why:** The project owner explicitly distinguishes the website domain from the support sender domain. Resend requires `quickxchange.net` verification for the configured support sender.

**How to apply:** Keep website links on `quickchange.exchange`, but send support and transactional email as `support@quickxchange.net`. Verify `quickxchange.net` in Resend before live tests.