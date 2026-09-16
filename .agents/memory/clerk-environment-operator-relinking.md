---
name: Clerk environment operator relinking
description: Authorization rule for operator records copied between isolated Clerk environments.
---

An active operator matched by the current Clerk user’s verified email may atomically replace a stale linked Clerk user ID. Increment the authorization version and audit the relink so the prior identity loses access.

**Why:** Development and production Clerk instances issue different user IDs. Production data copied from development can otherwise leave every operator active but inaccessible because email linking only accepts null identity fields.

**How to apply:** Keep direct Clerk-ID lookup first. Use verified-email relinking only for an active exact-email match, fence the update against the prior identity and authorization version, and never relink suspended or removed operators.