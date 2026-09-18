---
name: Customer cancellation boundary
description: Eligibility and integrity rules for customer-initiated order cancellation.
---

Customer cancellation is allowed only for manual Swap orders that are still awaiting funds, display a genuinely pending/unpaid status, have not been marked paid, and are not archived. Provider-managed Convert orders and later manual lifecycle states remain operator/provider controlled.

**Why:** Admin may cancel some funded or processing manual orders as an operational exception, but customers must not reverse orders after payment reporting, fund confirmation, payout processing, or an irreversible provider create. The customer boundary is intentionally stricter than the Admin transition table.

**How to apply:** Enforce the rule on the server with versioned compare-and-swap conditions, not only UI visibility. Preserve the order row, set both public and manual states to cancelled, retain tracking/history, and reject any later Mark as Paid request.