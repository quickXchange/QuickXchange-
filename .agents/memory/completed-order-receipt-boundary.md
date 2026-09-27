---
name: Completed-order invoice boundary
description: Invoice documents use saved customer-visible order facts, not operational evidence or current configuration.
---

**Rule:** Completed Swap and Convert use one A4 invoice template. Use saved order identity, amounts, rate, dates, and route; include customer-entered Step 2 details only through the server's historical safe projection, and show a fee only from a verified exact order snapshot. Token-gate private details on public tracking. Preserve the invoice brand image as a versioned asset; do not read current payment/pricing configuration to fill gaps. Both Download PDF and Print use the same generated PDF (Print opens the browser PDF viewer), excluding blockchain hashes, confirmations, detected times, explorer links, and provider/monitoring internals. Normal View Order still presents Transaction Details. Do not add a separate Invoice action or app page; show configured Trustpilot review only after genuine completion.

**Why:** Historical invoices should not silently change when logos, prices, routes, or payment settings change. Raw payment/provider maps mix customer input with internal state. Independent HTML print styles lost repeated branding on long invoices, so printing the generated PDF keeps pagination and content identical. A separate Invoice action or early review prompt confuses the completion experience.

**How to apply:** Keep Print on the generated PDF viewer rather than reintroducing a separate HTML print template. Omit unprovable fee/custom data rather than guessing, and gate both invoice actions and review through actual completed-order state. Multi-page PDFs must repeat brand and footer without clipping long fields.