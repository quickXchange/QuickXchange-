---
name: BSC legacy readiness boundary
description: Why the historical BEP20 readiness exception must never authorize token deposit routes.
---

The legacy BEP20 readiness exception applies only to an enabled native BNB identity with no contract address. BEP20 tokens must satisfy the same exact identity, enabled-state, health, address, and readiness-proof requirements as other token routes.

**Why:** The historical network-level exception could otherwise authorize a newly added or disabled token identity merely because it shared the BEP20 network. Native BNB behavior must remain stable without weakening token activation safety.

**How to apply:** Any new BSC token route, Admin activation path, or order-creation gate must fail closed until its own verified contract identity and current route proof pass. Never broaden the native exception by network code alone.