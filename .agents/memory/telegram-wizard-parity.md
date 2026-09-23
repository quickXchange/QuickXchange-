---
name: Telegram wizard parity
description: Source-option and callback rules that keep Telegram aligned with the main exchange widget.
---

Telegram Swap source eligibility must match the main widget: every source, including crypto networks, must be send-capable and present in the configured executable route set. Keep receive targets restricted to exact directed routes.

**Why:** Exposing active but receive-only crypto networks let users select them under “You Send,” then fail with “exchange routes are temporarily unavailable” because no directed target existed.

**How to apply:** Share or regression-test equivalent source predicates across both surfaces. Admin pricing and route availability remain authoritative; do not use lifecycle alone as proof that a source can execute.

Telegram Convert must preserve the canonical API settlement-option IDs supplied by the backend capability projection and fail closed when a provider instrument has no canonical match.

**Why:** Reconstructing IDs from provider slugs created selectable Telegram routes that the shared quote/order service could never execute.

**How to apply:** Match provider catalog entries to backend-projected options by exact asset/network identity, carry the projected ID unchanged, and never substitute a Telegram-only ID in production.

Telegram callback payloads must be parsed by their delimiter/shape rather than hard-coded substring offsets.

**Why:** An off-by-one prefix length made a valid optional-field Skip callback parse as `NaN`, so Telegram acknowledged the click but did not advance the wizard.

**How to apply:** Validate the full callback format, extract typed indexes structurally, and cover zero, multi-digit, malformed, and extra-segment cases.