---
name: Customer deposit provider privacy
description: Keep internal funding-source identities out of customer deposit instructions while preserving frozen payment details.
---

Customer-facing deposit details must never label the frozen address with its internal provider or fallback source, whether WhiteBIT, Manual, or another future provider. Continue to show the address, network, and Copy action.

**Why:** The provider is an operational routing choice, not information the customer needs to send funds; exposing it was explicitly rejected. Hiding its label is presentation-only and must not alter which provider funded the order or which address was frozen.

**How to apply:** When adding or revising customer order pages, modals, QR views, tracking views, or funding instructions, avoid displaying internal provider/source tags alongside deposit addresses. Keep provider selection, fallback, monitoring, and order data unchanged unless separately requested.