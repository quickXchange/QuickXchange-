---
name: Admin inbox event boundaries
description: New-order-only inbox scope, independent outbound channels and operator dismissals.
---

The user wants Admin Notifications and the bell to contain ONLY successfully created Swap/Convert orders, titled "New Swap Order" and "New Convert Order". Do not generate inbox events for status changes, detected/confirmed payments, processing, terminal outcomes or technical alerts. Hide existing non-creation events from the feed and counts without deleting historical rows, payment history or audit records. Preserve technical logs/monitoring separately.

**Why:** The user explicitly narrowed the former order-activity inbox to new orders only while preserving its compact design and all read/delete/filter controls.

**How to apply:** Apply identical creation-only eligibility to lists, counts and receipt actions. Emit transactionally only after successful creation, deduplicate per order (including recovered uncertain Convert submissions), and use the saved order creation timestamp. Retain historical non-creation rows without displaying or counting them. Keep rows compact with Swap/Convert identity, order reference and independent receipt actions.

The order inbox remains independent of email/Telegram delivery switches.

**Why:** Opting out of outbound messages must not suppress staff order visibility.

**How to apply:** Integrate creation through canonical order transactions, not UI visits or outbound sender success. Keep all customer lifecycle/email/Telegram processing unchanged. Keep dismissals operator-specific and retain shared event identity against replay. Never store raw technical errors, credentials or customer payment details in summaries.
