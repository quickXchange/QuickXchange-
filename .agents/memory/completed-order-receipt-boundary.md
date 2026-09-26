---
name: Completed-order receipt boundary
description: Customer-facing completion receipts and review prompt must not conflate print documents with live order details.
---

Completed Swap and Convert receipts are deliberately limited to brand, status, order identity, exchange amounts, dates, rate, and relevant payment/network route. Printable and downloadable versions must both exclude blockchain hashes, confirmations, detected times, explorer links, and transaction sections. The normal View Order UI still presents Transaction Details. Use only Download PDF and Print for the receipt, not a separate Invoice action; show the configured Trustpilot review destination only for genuinely Completed/Done orders.

**Why:** The user wants a clean customer receipt without losing the operational transaction evidence available in the interactive order view. A separate Invoice action or early review prompt confuses the completion experience.

**How to apply:** When modifying completion presentation or receipt generation, compare the print and PDF output together, keep their content boundary in sync, and gate the review prompt through the same actual completed-order state as the receipt actions.