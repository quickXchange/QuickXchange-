---
name: Telegram initData signature field
description: Current Telegram Mini App bot-token HMAC behavior when initData includes the newer signature parameter.
---

For bot-token HMAC validation of Telegram Mini App initData, exclude only the `hash` parameter from the sorted data-check-string. Keep the newer `signature` parameter in that string.

**Why:** Current Telegram Android and Desktop clients include `signature`. Excluding it produces a valid-looking request whose HMAC always fails, even though the Mini App was genuinely launched by the correct bot.

**How to apply:** Regression tests for initData validation must include a signed payload containing `signature`, in addition to legacy payloads without it. Continue comparing `hash` in constant time and never trust `initDataUnsafe`.