# XML and deposit-monitoring stabilization

## Release status

The application fixes below are implemented, tested and built. They are **not
published**. Production XML and ERC20/BEP20 monitoring are **not certified healthy**.
No credentials, Production settings, DNS, pricing, orders, credits or payouts
were manually changed. No live test order or customer message was created.

## Implemented fixes

### XML publication

- Converted the full-matrix quote refresh into bounded batches of up to 256
  directions, retaining the existing maximum of eight concurrent reads.
- Prioritized existing publications nearing expiry before warming cold directions.
- Reused the validated partner catalog between its existing refresh deadlines
  instead of downloading all 57,062 partner pairs for every small rate batch.
- Filtered rate requests through the existing executable Convert catalog.
- Changed provider 429 handling to yield/cool down the batch instead of sleeping
  and repeatedly retrying each direction behind the same exhausted quota.
- Exposed pending directions in existing Admin diagnostics. Pending, expired,
  ambiguous, unavailable and nonexecutable rates are not published.
- Added proactive Swap XML warming, refreshing before its existing expiry rather
  than relying on the first visitor after expiry.
- Preserved original per-row freshness limits, provider precision, fee semantics,
  affiliate identity, customer quotes and configuration/credential fences.

**Capacity boundary:** a per-direction API cannot refresh an arbitrarily large
matrix within a short freshness window. Cold directions may remain pending
while existing eligible publications are refreshed. This is not a configured
total-direction cap, and freshness is never extended to pretend completeness.

### RPC readiness and recovery

- Preserved safe HTTP status, JSON-RPC code, failure category and retry timing
  through adapter wrappers, monitoring logs and readable health errors.
- Never log raw RPC error bodies, endpoint URLs, API keys or provider messages.
- Added bounded per-endpoint cooldown for HTTP and JSON-RPC quota/rate failures.
- Scheduler backoff respects the provider retry window.
- Verified cooldown expiry allows recovery; readiness remains fail-closed.
- Did not install a silent fallback, disable TLS checks or mark an unhealthy
  provider ready.

### Shutdown safety

Runtime logs exposed monitoring lease cleanup after the shared PostgreSQL pool
had already closed. Monitoring now drains its current cycle before pool closure.
The new XML warming worker also drains outstanding publication saves. Worker
ticks cannot overlap, and stopping prevents queued work from starting.

The previously tested PostgreSQL acquisition-retry, WhiteBIT and Quickex startup
improvements remain intact. Submitted SQL/financial writes are never replayed.

## Verification

**115 targeted tests passed; zero failures or skips in these selected suites.**

| Suite | Passed |
|---|---:|
| RPC quota diagnostics, cooldown and recovery | 6 |
| Rolling XML batching, executable filtering and freshness | 4 |
| Existing Quickex XML contracts, retirement, precision and identity fencing | 26 |
| Existing XML refresh concurrency, persistence and invalidation | 7 |
| Blockchain adapters, canonical evidence and bounded RPC operations | 15 |
| Automatic XML mapping, fee and format contracts | 20 |
| Isolated XML Admin/API integration | 1 |
| Isolated watch registration integration | 2 |
| Isolated verified-funding/order projections | 9 |
| Isolated monitoring matching, finality and catch-up policy | 21 |
| Worker shutdown/draining and queued-work prevention | 4 |

The integration tests used disposable databases; customer-facing provider order
creation and customer messaging were not used as tests. Unchanged WhiteBIT,
Telegram and other already-passing suites were not repeatedly rerun.

- API TypeScript checks: PASS.
- Final production build and web artifact verification: PASS.
- Build ID: `f32e1a5d439c-20261014235307`.
- Whitespace/diff validation: PASS.
- Development API restarted with the changes and its public Website rendered.
- Real monitoring RPC calls confirmed safe quota classification. Polygon's
  chain, head, block, log and receipt reads also succeeded in the observed cycle;
  this is not a claim that every monitoring network passed.

### Actual Production quotes — no orders created

| Mode | HTTP | Total request time | Signed quote, positive output, matching input/mode, future expiry |
|---|---:|---:|---|
| Fixed | 200 | 1,091 ms | PASS |
| Floating | 200 | 497 ms | PASS |

These are successful point-in-time provider quote checks, not proof of permanent
Quickex connectivity or an end-to-end live deposit/payout certification.

### Live XML limitations

The latest unmodified Production `/api/rates.xml` check returned HTTP 503,
zero items and `X-XML-Rate-Source: unavailable` in 3,235 ms. Development also
returned 503 with no fresh publications while Quickex connectivity was blocked.
Expired saved publications were not mislabeled as fresh.

New XML behavior passed isolated integration/refresh tests, but its Production
effect cannot be verified until the tested build is published. A source/build
PASS is not a live XML PASS.

## Confirmed external dependency findings

1. The selected Development ERC20 and BEP20 endpoint credentials return
   **HTTP 429 / JSON-RPC 429, exhausted monthly capacity**. Real monitoring
   cycles reproduced this, not just standalone probes.
2. Production selects the same secret-reference names and reports persistent
   provider failures. Its existing logs omit HTTP/RPC detail; exact Production
   quota parity must be confirmed by the new telemetry after rollout rather than
   inferred from Development secret values.
3. The existing alternative BSC endpoint answers chain/head/block calls but
   rejects `eth_getLogs` with `-32005`, including exact-recipient, one-block
   requests. It is **not a verified monitoring fallback** and was not selected.
4. Development Quickex outbound connectivity remains blocked. Existing
   verified-TLS transport safeguards were not weakened or bypassed.
5. Production logs still contain a physical database connection-establishment
   timeout on the old release. The already-tested acquisition fix and this
   shutdown fix need an approved rollout and real runtime observation; current
   Production database stability is not certified.

## Owner actions genuinely required

### Restore RPC capacity

Restore usable monthly capacity on the existing RPC provider account, or approve
a replacement that passes the entire exact-network RPC method set. New API keys
are not inherently required if the existing account's capacity can be restored.

Do not select the old BSC endpoint merely because chain/head calls work. Validate
chain identity, head, canonical block, exact production-sized token log range,
transaction receipt and historical block access. Preserve watches, cursors,
order snapshots and evidence; readiness proof must be freshly established.

Quota cooldown remains bounded and automatically permits a new attempt after
expiry. An account capacity change must not be represented as verified before
the methods actually succeed.

### Approve publication

Publishing is required to put the tested application fixes into Production.
No Production credential, route or financial-setting change is bundled.

After publication and capacity restoration, verify:

1. Readiness succeeds against the actual Production endpoints and persisted
   health/proof becomes current without forced healthy flags.
2. Existing watches resume normally without backdating monitoring cursors.
3. Canonical receipt/finality checks and idempotent application still gate
   deposit recognition; payout completion remains independently confirmed.
4. Admin/customer tracking and notifications use canonical persisted order state.
5. XML retains executable fresh directions across rate refresh, expiry and
   recovery boundaries; no stale result is labeled live.
6. Fixed/Floating quote checks and Production pool telemetry remain healthy.

**Final disposition:** tested application patch ready for an approved rollout;
full Production service certification remains blocked by RPC capacity,
unpublished fixes and unresolved Development Quickex egress.
