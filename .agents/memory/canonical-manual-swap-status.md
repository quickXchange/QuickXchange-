---
name: Canonical Manual Swap status
description: Defines the single customer-facing lifecycle shared by every Manual Swap surface.
---

Manual Swap customer status is authoritative in the backend order status field: `awaiting funds`, `processing`, `completed`, `cancelled`, `failed`, or `refunded`. Website views, tracking, Telegram Bot, and Telegram Mini App must render and refresh that field rather than infer a separate lifecycle from operational settlement stages. Customer presentation may label `completed` as “DONE ✅”.

**Why:** A confirmed payment previously produced a separate “funds confirmed” state while different clients independently mapped settlement stages. The same order then appeared to have different statuses across Admin, website, Bot, and Mini App.

**How to apply:** Internal Manual settlement stages may continue to support operator workflow, but every funded or payout-in-progress stage projects backend status `processing`. Completion and terminal changes update that same order and status; consumers only map the authoritative value to display text.