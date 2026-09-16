---
name: Admin permission boundaries
description: Durable authorization rules for QuickXchange team members, roles, and sensitive Admin operations.
---

Every Admin endpoint must be classified in the centralized permission policy. Staff authorization is deny-by-default and uses reusable-role permissions plus individual allows minus individual denies. The Owner always has full access.

**Why:** Hiding UI controls does not prevent direct API access, and broad status or management permissions can accidentally grant unrelated sensitive actions.

**How to apply:** Add new Admin routes to the policy coverage matrix before release. Derive permissions from the actual mutation fields and target state. Receiving-wallet changes, credential operations, and role or individual permission changes remain Owner-only regardless of stored staff overrides. Keep activity metadata redacted and append-only.