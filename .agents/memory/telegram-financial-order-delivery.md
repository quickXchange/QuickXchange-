---
name: Telegram financial order delivery
description: Reliability and access-control rules for customer Telegram flows that create deposit-funded orders.
---

Customer Telegram exchange flows must be private-chat and user-bound. Process updates through a durable leased inbox, serialize each chat, and fence wizard transitions against replayed update IDs. Freeze the exact idempotent order request before submission, reconcile or resume it after uncertainty, and deliver creation/deposit instructions through a claimed outbox. When a crypto deposit address is still provisioning, keep retrying with capped backoff rather than exhausting a terminal delivery-attempt limit.

Automatic payment and completion notices for Manual Swap orders must be enqueued inside the same database transaction that accepts the authoritative state transition. Use an event-specific immutable deduplication identity for payment receipt rather than the order's mutable status version, and revalidate the exact order/chat link plus compatible customer ownership immediately before delivery.

**Why:** A financial bot can otherwise expose order data in groups, apply one message to two wizard steps after a crash, lose an accepted create response, duplicate recovery notices across workers, or finalize an order without ever delivering its funding address.

**How to apply:** Use these boundaries for every Telegram action that advances an exchange, links an order, or sends funding instructions. A confirmed provider deposit may advance only its exact unambiguous Manual Swap from awaiting funds to funds confirmed. Completion notices come only from the canonical completed-status CAS path. Informational retries may duplicate harmless text, but financial state notices and funding delivery must remain recoverable and winner-fenced across process crashes and multiple server instances.