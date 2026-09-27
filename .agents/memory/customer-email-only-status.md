---
name: Customer email-only status notifications
description: Channel boundary between customer lifecycle alerts and transactional Telegram bot interactions.
---

Customer lifecycle status notifications are email-only. Telegram status alerts are reserved for Admin; pending legacy customer Telegram lifecycle rows should be suppressed as well as preventing new rows.

**Why:** The user explicitly separated customer notifications from Admin Telegram alerts. A previous Telegram bot customer-order path existed independently of website notification settings, so hiding the website controls alone would leave the policy incomplete.

**How to apply:** Preserve Telegram Mini App account linking, order creation, deposit instructions, and other transactional bot interactions. Do not reintroduce customer Payment Received, processing, completed, or failed/cancelled Telegram status delivery when adding new order paths.