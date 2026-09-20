---
name: Convert status synchronization
description: Canonical Quickex Convert lifecycle and notification boundaries shared by every customer surface.
---

Quickex Convert uses one canonical customer lifecycle: `awaiting funds`, `processing`, then `completed`, with distinct `failed`, `cancelled`, `refunded`, and `expired` terminal states. Every surface reads the same Quickex order aggregate.

**Why:** Provider-specific intermediate labels caused Admin, website, Telegram Bot, and Telegram Mini App to disagree. Payment Received must also mean exact Quickex provider confirmation, not a customer action or Swap deposit monitor.

**How to apply:** Keep Convert reconciliation, addresses, instruments, and milestone outbox events Quickex-only. Queue Payment Received and Done as lifetime-idempotent Convert events; never derive them from Manual Swap, WhiteBIT, or an Admin-only status override.