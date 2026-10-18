---
name: Admin permission boundaries
description: Durable authorization rules for QuickXchange team members, roles, and sensitive Admin operations.
---

Every Admin endpoint must be classified in the centralized permission policy. Staff authorization is deny-by-default and uses reusable-role permissions plus individual allows minus individual denies. The Owner always has full access.

**Why:** Hiding UI controls does not prevent direct API access, and broad status or management permissions can accidentally grant unrelated sensitive actions.

**How to apply:** Add new Admin routes to the policy coverage matrix before release. Derive permissions from the actual mutation fields and target state. Receiving-wallet changes, credential operations, and role or individual permission changes remain Owner-only regardless of stored staff overrides. Keep activity metadata redacted and append-only.

Admin API regression tests must exercise the central permission middleware before the feature router, not only the router's local authentication.

**Why:** Router-only inbox tests passed while Production rejected the same endpoints as unclassified, including for the Owner. A passing handler test did not establish deployed route accessibility.

**How to apply:** Preserve central-gate coverage for listing and every mutation, including unauthenticated, suspended and permission-scoped operators. Personal notification receipts may use authenticated operator access only when every event read/write is still filtered by the existing domain permissions and current operator identity.