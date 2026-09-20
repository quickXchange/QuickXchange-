---
name: Canonical EVM event signatures
description: Prevent silent token-monitor failures caused by an incorrect event topic copied into both implementation and tests.
---

EVM event topic constants must be checked against an independently observed canonical receipt or computed from the canonical event signature. Do not let unit-test fixtures copy an unverified implementation constant.

**Why:** A syntactically valid but incorrect ERC-20 Transfer topic existed in both the monitor and its parser test. Native monitoring and shallow provider health checks remained healthy, while every real token transfer was silently excluded.

**How to apply:** For token-monitor changes, verify the topic against a real successful receipt or a separately computed hash, and include a fixture sourced independently from the implementation.