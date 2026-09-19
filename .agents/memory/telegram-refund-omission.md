---
name: Telegram refund omission
description: Product rule removing refund addresses and memos from every Telegram exchange flow.
---

Telegram Swap and Convert must not prompt for, display, or submit refund addresses or refund memos.

**Why:** The product owner explicitly removed refund-destination options from the Telegram bot. Hiding only the prompt is insufficient because saved sessions and frozen retry payloads can retain old values.

**How to apply:** Strip refund fields when saving sessions, building Telegram create payloads, and confirming frozen payloads. Legacy refund states may only advance to email; provider and website contracts remain unchanged unless separately requested.