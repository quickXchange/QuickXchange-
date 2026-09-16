---
name: Clerk verified-email authorization testing
description: Programmatic Clerk sessions can look signed in while backend email-based authorization still lacks a verified address.
---

When testing authorization that links a database role by Clerk email, create the test identity with a server-visible verified primary email before expecting the first protected request to link it.

**Why:** A programmatic Clerk session can authenticate successfully in the browser while its server-side email is not yet verified. The application correctly fails closed in that state, which can look like a broken role record during end-to-end tests.

**How to apply:** Explicitly verify the test user's primary email in Clerk, then seed the matching normalized database email without a Clerk user ID. Confirm the first protected request links the ID and writes the identity-link audit event.