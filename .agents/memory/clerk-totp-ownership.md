---
name: Clerk TOTP ownership
description: Security boundary for authenticator-only MFA and Admin enforcement.
---

Clerk exclusively owns TOTP enrollment secrets, QR data, verification challenges, disable/reset operations, throttling, and lockouts. QuickXchange must not duplicate those values or implement a parallel OTP endpoint.

**Why:** Keeping factor material in one hardened identity system avoids split-brain enrollment, weaker local secret storage, and client-asserted MFA state.

**How to apply:** Ordinary customer routes remain unaffected. Owner and operator access requires both Clerk's server-side TOTP enrollment state and a non-negative second-factor verification age from the signed session. Audit only safe enforcement metadata.