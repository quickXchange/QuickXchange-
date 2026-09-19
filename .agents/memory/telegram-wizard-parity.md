---
name: Telegram wizard parity
description: Source-option and callback rules that keep Telegram aligned with the main exchange widget.
---

Telegram Swap source eligibility must match the main widget: expose every active crypto network, while non-crypto sending methods still require a configured executable source route. Keep receive targets restricted to exact directed routes.

**Why:** Filtering every source through pricing-route coverage reduced multi-network assets such as USDT to one network even though the main widget intentionally exposes all active crypto sources.

**How to apply:** Share or regression-test equivalent source predicates across both surfaces. Do not broaden target filtering; it remains the execution gate after a source is selected.

Telegram callback payloads must be parsed by their delimiter/shape rather than hard-coded substring offsets.

**Why:** An off-by-one prefix length made a valid optional-field Skip callback parse as `NaN`, so Telegram acknowledged the click but did not advance the wizard.

**How to apply:** Validate the full callback format, extract typed indexes structurally, and cover zero, multi-digit, malformed, and extra-segment cases.