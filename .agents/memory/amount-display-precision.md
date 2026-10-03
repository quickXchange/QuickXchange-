---
name: Amount display precision
description: Global three-decimal human presentation and exact financial-data boundaries.
---

QuickXChange monetary and crypto amounts, exchange rates, fees and add-ons display a maximum of three decimal places, rounded rather than truncated, with unnecessary trailing zeros removed. This applies across the website, customer/Admin areas, Telegram Mini App, bots, order screens and human-readable receipts.

**Why:** The user explicitly requested one global display-only rule and prohibited changes to financial precision.

**How to apply:** Use the shared presentation formatter at rendering boundaries. Never use its result for database values, provider/API payloads, quotes, accounting, settlement or blockchain calculations. Machine-readable feeds and exports retain their exact data.

Editable exchange inputs retain raw state and restore it on focus; only their unfocused presentation rounds. Configuration editors must retain exact input values where native form serialization or validation could otherwise consume rounded text. Deposit amount copy actions use the original exact amount, not the rounded label.

**Why:** Display rounding must not silently change a quote request, operator configuration or the actual amount a customer sends.

**How to apply:** Test both the visible rounding and the unchanged request/copy value. Do not decide whether a fee is zero from its formatted display: small nonzero fees legitimately display as zero under this rule.