---
name: Clerk email verification proof
description: Safe handling of operator-requested email confirmation with the managed Clerk backend.
---

Do not mark a Clerk email address verified administratively as a substitute for proof of mailbox control. If the installed managed backend client cannot initiate a verification challenge, fail clearly without changing verification state.

**Why:** An owner-only administrative toggle still weakens identity assurance by asserting control the customer never proved. The available backend client exposes profile administration but no proof-of-control initiation flow suitable for this operator action.

**How to apply:** Read actual Clerk verification state for display. Initiate a supported customer-completed challenge when the SDK provides one; otherwise return an explicit unsupported result and preserve the existing state.