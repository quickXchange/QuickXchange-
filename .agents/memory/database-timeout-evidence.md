---
name: Database timeout evidence
description: Interpreting intermittent pool failures without mistaking recovered counters or provider errors for database exhaustion.
---

A pool's counters captured after an error cannot establish its occupancy during the failed acquisition. Healthy later PostgreSQL snapshots cannot establish the root cause of an earlier connection-establishment timeout.

**Why:** Production worker failures had idle clients and zero waiters at catch time, while some apparently database-related worker failures were actually external provider exceptions. Treating either observation as a complete diagnosis would justify the wrong pool or SQL change.

**How to apply:** Separate provider exceptions, physical handshakes, pool waiting, and SQL execution. Correlate acquisition-start/end counts, durations and event-loop delay with incident-time logs before increasing pool limits, rewriting queries, or claiming resolution. Never automatically replay financial writes to recover from uncertain connection outcomes.

Recovery may retry a transient failed acquisition only before any client is handed to SQL. A socket failure after submission must remain an uncertain outcome, not trigger statement or transaction replay.

**Why:** Monitoring, notification and order workers can perform financial writes; replaying an operation whose response was lost can duplicate credits or payouts.

**How to apply:** Keep recovery bounded at the connection-acquisition boundary and test both startup failures and post-submission connection loss. Preserve higher-level idempotency and reconciliation.

Production SQL diagnostics run against a read-only replica; its `pg_stat_activity` and pool/session counters are not live application-runtime connection metrics.

**Why:** A healthy diagnostic replica cannot establish occupancy, gateway health or connection stability in the deployed application's actual pool.

**How to apply:** Use real application readiness requests and deployed acquisition telemetry for connection incidents, and use replica queries for stored-data/catalog inspection.

An event-loop histogram's maximum or percentile is not incident-local unless its
sampling window is known. A healthy Development pool also cannot establish that a
different, still-unpatched Production runtime has recovered.

**Why:** A long-running published process reported extreme cumulative delay
alongside later connection waits, without enough information to identify the
borrower or date the delay. Development quotes and readiness were healthy while
Production continued reporting saturation.

**How to apply:** Require windowed metrics and client-hold attribution before
naming a blocking worker or query. Report tested overlap fixes separately from
verified Production recovery; do not increase capacity or retry financial writes
on the strength of correlation alone.

`pg.Pool.totalCount - idleCount` is not conclusive proof of checked-out SQL
clients: the driver's total can include connections still being established.

**Why:** Historical logs showed a full pool with waiters but did not separately
measure acquisition completion, so they could not distinguish long borrowers
from pending connection establishment.

**How to apply:** Compare explicit successful-checkout tracking with pool totals
before attributing exhaustion to queries or workers.
