---
name: QuickEx runtime proof fencing
description: Safety and availability rules for activating Convert from configured credentials and protecting in-flight provider creates.
---

QuickEx Convert must require a fresh differential credential proof in each API process, not merely persisted verification metadata. Complete that proof before accepting traffic, refresh it periodically, and retry transient failures while keeping Convert unavailable.

**Why:** Environment-configured credentials were valid but never activated for users after hardening. Trusting persisted proof indefinitely would also leave revoked credentials active.

**How to apply:** A successful owner rotation or startup proof may establish the current process proof. Any refresh attempt invalidates the prior runtime proof until it succeeds.

Verified credentials saved through the owner admin panel are authoritative. Environment credentials are bootstrap input only when no stored credential record exists.

**Why:** Letting a standing environment-source override win after an admin rotation made the panel report a successful save while customer order capability continued using the old environment key.

**How to apply:** Startup should re-verify stored credentials first. Use environment secrets to seed storage only when it is empty; never silently overwrite an owner-managed rotation during restart.

Irreversible provider order creation must capture the current proof generation and credential fingerprint, then recheck both immediately before starting the external create request.

**Why:** Capability checks earlier in a request do not prevent a scheduled proof refresh or owner rotation from invalidating credentials while address checks and intent persistence are still running.

**How to apply:** Abort before the provider side effect whenever the proof generation or fingerprint changes. Signed reads for reconciliation may follow a different policy, but that decision must remain explicit.