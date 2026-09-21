---
name: Payment-backed Admin notifications
description: Durable evidence and channel independence rules for Manual Swap Admin lifecycle alerts.
---

Admin email and Telegram lifecycle notifications for Manual Swap must independently revalidate authoritative payment evidence from the payment subsystem. A notification outbox event is not payment evidence and must not gate another channel or later lifecycle event.

**Why:** Channel or event toggles can suppress creation of an outbox row. Reusing that row as evidence couples unrelated settings and can either suppress valid later alerts or weaken the boundary that prevents unpaid-order alerts.

**How to apply:** For Payment Received and every later Admin lifecycle alert, use the durable processed provider deposit or applied blockchain match as the evidence source. Evaluate email, Telegram, and each event toggle independently at enqueue and delivery.