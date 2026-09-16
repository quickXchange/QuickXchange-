---
name: In-widget order uncertainty
description: Safety rules for ambiguous exchange-order creation inside multi-step widget flows.
---

When an order-create request has an uncertain outcome, preserve its idempotency identity and prevent any action that would unmount, reset, or replace that request state. A safe retry must reuse the same identity. Only rotate it after a known pre-create failure or when starting a new flow after a confirmed order.

**Why:** A lost create response can hide an accepted provider order. Resetting the flow, switching modes, or retrying with a new identity can create a second irreversible exchange.

**How to apply:** Keep ambiguous outcomes inside the current widget, disable editing and mode changes that discard local state, recover by returned order ID when available, and make new-flow resets explicitly generate a fresh identity.