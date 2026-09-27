---
name: Payment-backed Admin notifications
description: Durable evidence and channel independence rules for Admin lifecycle alerts.
---

Admin email and Telegram Payment Received, processing, and completed notifications must independently revalidate authoritative payment evidence. A notification outbox event is not payment evidence and must not gate another channel or later lifecycle event. Failed/cancelled is an exception: it can notify about an unpaid order, but its content must never claim payment was made.

**Why:** Channel or event toggles can suppress creation of an outbox row. Reusing that row as evidence couples unrelated settings and can either suppress valid later alerts or weaken the boundary that prevents unpaid-order alerts.

**How to apply:** For Manual Swap financial milestones, use the durable processed provider deposit or applied blockchain match; for Convert, use an explicit positive provider-paid amount, not a claimed or expected amount. Evaluate email, Telegram, and each event toggle independently at enqueue and delivery. Keep unpaid failure/cancellation wording neutral.