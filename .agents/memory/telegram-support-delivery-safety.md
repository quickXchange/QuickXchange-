---
name: Telegram support delivery safety
description: Telegram-specific callback expiry and webhook-secret attestation boundaries.
---

Treat callback acknowledgement as best-effort, separate from delivery of an approved support reply.

**Why:** Telegram expires callback query IDs. A delayed durable reply can still be valid after acknowledgement expires; retrying the acknowledgement as a prerequisite can prevent the customer from ever receiving the reply.

**How to apply:** An expired acknowledgement must not block the FAQ/contact message. Keep errors sanitized and preserve reply-delivery retry semantics independently.

A matching webhook URL does not prove that Telegram uses the current webhook secret.

**Why:** Telegram's webhook information does not reveal the configured secret. Rotating the local secret while checking a matching URL can falsely report healthy registration even though every incoming update is rejected.

**How to apply:** Attest the current credential/secret/URL combination only after explicit successful registration. Persist safe internal registration evidence when readiness must survive restarts, invalidate it on rotation, and never expose its fingerprint in Admin responses.