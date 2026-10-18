---
name: Admin inbox event boundaries
description: Order-only inbox scope, independent outbound channels and operator dismissals.
---

The user wants Admin Notifications and the bell to contain ONLY Swap/Convert order activity: new orders, status changes, verified payments and terminal outcomes. RPC, Quickex/provider errors, monitoring and system alerts belong in separate technical logs/monitoring, not inbox counts.

**Why:** The user explicitly requested a compact order-only inbox without technical noise.

**How to apply:** Filter order eligibility server-side for both lists and counts; retain historical technical rows without displaying or counting them. Do not weaken technical monitoring when excluding its alerts. Keep rows compact with Swap/Convert identity, order reference and independent receipt actions.

The order inbox remains independent of email/Telegram delivery switches.

**Why:** Opting out of outbound messages must not suppress staff order visibility.

**How to apply:** Integrate events through canonical lifecycle/evidence paths, not UI visits or outbound sender success. Never infer payment from a status label. Keep dismissals operator-specific and retain shared event identity against replay. Never store raw technical errors, credentials or customer payment details in summaries.
