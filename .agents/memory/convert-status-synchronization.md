---
name: Convert status synchronization
description: Canonical Quickex Convert lifecycle and notification boundaries shared by every customer surface.
---

Quickex Convert uses one canonical customer lifecycle: `awaiting funds`, `processing`, then `completed`, with distinct `failed`, `cancelled`, `refunded`, and `expired` terminal states. Every surface reads the same Quickex order aggregate.

**Why:** Provider-specific intermediate labels caused Admin, website, Telegram Bot, and Telegram Mini App to disagree. Payment Received must also mean exact Quickex provider confirmation, not a customer action or Swap deposit monitor.

**How to apply:** Keep Convert reconciliation, addresses, instruments, and milestone outbox events Quickex-only. Queue Payment Received and Done as lifetime-idempotent Convert events; never derive them from Manual Swap, WhiteBIT, or an Admin-only status override.

Quickex amount fields are directional: a provider-confirmed claimed deposit is the customer's source payment, while `amountToWithdrawFact` is the destination payout and becomes the actual received amount only at completion. Keep expected and actual output amounts distinct.

**Why:** Treating the destination payout as source payment can produce emails and invoices that swap the sent and received economics.

**How to apply:** Payment Received requires canonical provider processing/completion evidence plus a positive source deposit fact. Snapshot source paid, destination payout, provider reference, and provider timestamps into the Convert outbox event.