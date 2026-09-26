---
name: Customer cancellation boundary
description: Eligibility and integrity rules for customer-initiated order cancellation.
---

The existing customer cancellation API remains available for compatibility only for manual Swap orders that are still awaiting funds, display a genuinely pending/unpaid status, have not been marked paid, and are not archived. Do not expose post-order cancellation controls in any customer-facing website or Telegram Mini App view, regardless of status. Admin cancellation stays separate.

**Why:** The owner requested that customers have no self-cancel action after placing an order, while explicitly preserving backend order processing and Admin functionality. The narrower server eligibility still protects the retained API.

**How to apply:** Keep customer UI free of cancel triggers and confirmation dialogs, including order confirmation, account history/detail, and Telegram Mini App. If maintaining the retained server API, enforce its stricter eligibility there with versioned compare-and-swap; preserve tracking/history and reject later Mark as Paid requests.