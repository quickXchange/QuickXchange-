---
name: Resend connector state validation
description: How to distinguish Replit connector configuration, runtime binding, and actual Resend credential health.
---

Treat connector configuration, runtime binding, and provider authentication as separate states. A Replit UI success message or Active badge does not prove that a usable connection record exists, and a runtime connection object does not prove that Resend accepts its saved API key.

**Why:** Replit can show stale Active rows that fail to disconnect with “Connection not found,” while the runtime later exposes a connection whose Resend credential is still rejected as invalid.

**How to apply:** Before requeueing failed email outbox events, make a read-only Resend API call through the same connector path. Proceed only when the provider accepts the credential; never use the UI badge alone as proof.