---
name: Provider idempotency ordering
description: Ordering rule for live provider capability checks and durable idempotent request replay.
---

Return an existing durable request after exact input comparison before consulting current provider availability. Require the live capability check only before creating a new intent or making a new provider side effect.

**Why:** Credentials, upstream health, or operator configuration can change after an order is accepted. Blocking replay on current availability hides the durable result and undermines idempotency, while skipping the check for a new request could execute a disabled route.

**How to apply:** In any provider-backed create flow, perform the idempotency lookup and conflict comparison first, then validate the current mapped capability immediately before persisting a new intent and calling the provider.