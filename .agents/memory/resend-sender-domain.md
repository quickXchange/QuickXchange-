---
name: Resend sender domain verification
description: Sender-domain constraint for QuickXchange transactional email.
---

The connected Resend credential is send-only and cannot list domains. The single authoritative domain for website links and transactional support email is `quickchange.exchange`.

**Why:** The project owner explicitly confirmed `quickchange.exchange` must be used everywhere, including `support@quickchange.exchange`.

**How to apply:** Use `quickchange.exchange` for website links and `support@quickchange.exchange` for support and transactional email. Verify that domain in Resend before live tests.