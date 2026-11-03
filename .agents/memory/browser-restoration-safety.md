---
name: Browser restoration safety
description: Route restoration, authentication return paths and safe exchange drafts.
---

Preserve the current route during session renewal or authorization failures. Only a confirmed signed-out state should initiate login; retain a validated same-origin return path. Do not turn access denial into homepage navigation.

**Why:** Mobile browsers can discard tabs, and token refresh can race the first resumed API request. Redirecting home loses context without resolving authentication.

**How to apply:** Keep session refresh bounded, maintain server-side authorization, and distinguish authentication loading, expiration, access denial and network failure.

Persist only non-sensitive exchange selections and amount inputs in tab-scoped, expiring drafts. Restore to the initial form with a fresh quote, never to automatic order submission. Never save contact details, payment fields, wallet addresses, quote tickets, acceptance or credentials as form progress.

**Why:** The user requested progress restoration without retaining sensitive payment information or reusing expired financial terms.

**How to apply:** Validate restored routes against the current executable catalog, let explicit URL selections override drafts, and check expiry on visibility/page restoration as well as submission. Real physical-device eviction cannot be proven by synthetic lifecycle events alone.
