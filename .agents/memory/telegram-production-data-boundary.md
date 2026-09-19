---
name: Telegram production data boundary
description: Environment rule for diagnosing live Telegram orders against Admin views and databases.
---

The live Telegram webhook and published Admin use the production database. The Replit preview Admin uses the development database and must not be expected to display live-bot financial orders.

**Why:** A production Telegram order was correctly persisted and linked, while opening its detail in the development preview returned `ORDER_NOT_FOUND`. Copying or dual-writing financial orders across environments would create duplicate and unsafe records.

**How to apply:** For live-bot reports, inspect production read-only data and the published Admin URL first. Use development Telegram traffic and development Admin only for isolated testing; never synchronize orders between environments.