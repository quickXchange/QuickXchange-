---
name: Customer notification outboxes
description: Reliability rules for deduplicating status-change notifications and safely reclaiming delivery work.
---

Key status-change events by an order's monotonic status version, not by the pair of status names. Compare-and-set both the current status and version, then increment the version in the same transaction that inserts the outbox event.

**Why:** Real lifecycles can revisit the same transition, while repeated provider polls can observe the same state many times. A status-pair key loses valid later cycles; a monotonic version distinguishes real cycles and collapses duplicate observations.

**How to apply:** Any new status writer must use the shared transactional transition path. Reclaimable delivery leases need a unique claim token, and every completion, suppression, or retry update must match that token so an expired worker cannot overwrite the current claimant.

Use a provider boundary with documented idempotency support for customer status events. Derive its key only from the immutable event identifier, and persist when that idempotency period first begins with the claim.

**Why:** A fenced database lease cannot prevent a duplicate when a provider accepts an email but its response is lost. Provider idempotency makes claim recovery safe, but its retention is bounded; once that window expires, another send is uncertain and must be suppressed rather than retried.

**How to apply:** Reuse the same key for every retry and recovery of an event. Set the first-attempt timestamp before the external call. If recovery happens outside the provider safety window, mark the event failed without calling the provider. Quarantine historical in-flight or previously-attempted pending rows whose old provider path had no key.

Resolve a verified Clerk email again at delivery time and send to that literal address. Do not deliver with only a Clerk user ID: Clerk resolves that form to the primary address, which may be unverified even when a verified secondary address allowed opt-in.