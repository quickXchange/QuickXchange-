# QuickXchange stabilization and release review

Date: 11 November 2026. Development-only changes. **Nothing published.**

## Final outcome

**Implemented Development fixes and focused regressions: PASS within the coverage
below. Unconditional Production readiness: HOLD.**

All six originally reported Website/Admin browser failures now have passing
focused reruns. The additional Revenue and language checks also passed after
justified test-contract updates. No known failure from those tested cases remains.
The historical managed 82-case job itself remains failed; it was not rerun or
relabelled as an 82/82 pass.

Production is still on the old release. Its intermittent Quickex connectivity
failures and database acquisition pressure have not been proven resolved by
these unpublished changes. A verified rollback source and approval for a
controlled, instrumented release are still required.

## Safety boundary

- Production investigation used read-only deployment telemetry.
- No Production database rows, credentials, DNS, pricing, fees, payment methods,
  wallet configuration, Revenue settings or orders were changed.
- Order-creation and accounting integration tests used disposable databases and
  simulated provider actions. No live provider order, payout or customer message
  was intentionally submitted by these tests.
- No schema migration was added. Do not run a data-reconciliation job for this patch.

## Fixes

### Reverse Swap quotes

The shared inverse solver previously advanced by floating-point increments around
a rounded fiat target and exhausted its 44-probe budget. The existing midpoint
progress safeguard now applies to the quantum-step branch too. Canonical forward
pricing still determines the signed result; the attempt and time budgets were
not increased.

Both clients use `POST /api/exchange/quote-by-receive` for this Manual Swap route.
An isolated reproduction exhausted 44 probes while advancing by approximately
`4.55e-13` per probe; the corrected solver converged. This is not a Quickex
Convert request, and a missing SEPA rule or a provider outage is not needed to
reproduce the defect. The screenshot's old displayed amount was not treated as
a verified quote.

Website and Mini App retain fresh signed-quote submission gates. The Mini App
hides the old calculated Swap amount when the current quote is invalid or expired.
Customer-safe error messages exist in English, French, German, Russian, Spanish,
Korean and Ukrainian. Canonical amounts, addresses, route IDs and provider
precision are not translated or rounded for processing.

### Database and worker lifecycle

Production logs show the pool at its ten-client limit, zero idle clients, up to
nine waiters, acquisition failures and prolonged waits. They do **not** identify
the exact SQL statement or client holder. The old counters also cannot
distinguish checked-out connections from slots still establishing a connection.
The inspected logs do not establish physical PostgreSQL handshake failures as
the cause.

- Newsletter and Telegram News interval workers now use the existing single-flight
  worker implementation. The original delayed first tick is preserved.
- Shutdown drains those workers before closing the pool.
- Connection diagnostics identify the application component and duration of
  checked-out clients without recording SQL, parameters or credentials.
- Event-loop diagnostics use a rolling one-minute window instead of an
  unbounded historical histogram.
- Pool size remains ten. No statement or financial transaction is automatically
  replayed; existing bounded recovery is confined to acquisition before SQL.

These changes correct a confirmed overlap risk and improve attribution.
They are **not proof that Production contention is resolved**. That requires
observing the patched runtime after an explicitly approved release.

### Fiat Buy monitoring

Isolated EUR Buy tests exposed spurious blockchain registration gaps for bank
funding. An explicitly frozen `fiat-payment-method` source now bypasses blockchain
watch registration. Crypto sources and historical orders without that provenance
retain the prior monitoring policy. No existing watch or gap record was deleted.

A separate read-only Development check explained existing Bitcoin scan warnings:
of 32 active Bitcoin watches, 19 saved addresses fail the Mainnet decoder; all
32 native-asset identities passed the kind/decimals/contract checks. These are
existing stored-address issues, not evidence of an RPC outage. Their addresses
and order identities are intentionally omitted. No watch or address was altered.
Before claiming those historical watches healthy, the Owner must reconcile their
original obligations and authorize any appropriate retirement. This query did
not inspect or change corresponding Production records.

### Revenue table

Restored the shared mobile horizontal-scroll edge hint and its hide-on-scroll
behavior on the completed-orders table. No Revenue calculation, rate, input,
snapshot, layout setting or saved accounting record was changed.

### Regression maintenance

- The EUR Buy test now expects the existing **new-order-only** Admin inbox policy;
  changing an order status must not create an Admin inbox status notification.
- Source-contract checks recognize customer copy in the existing shared English
  dictionary instead of requiring hardcoded English in localized components.
- Bulk-field stale-review checks allow the existing error-toast call between
  review invalidation and the inline error.
- The isolated API runner supports `--backend-only`, reusing the canonical backend
  suite while leaving browser execution to one tester. It fails closed if the
  canonical script's trailing browser step changes.

## Verification evidence

| Area | Result |
| --- | --- |
| Canonical backend suites, final application pool/worker code | 552 passed; 20 skipped; no failures |
| Accounting and historical profit safeguards, disposable DB | 27 passed |
| EUR Buy creation, reverse quotes, validation, Admin and tracking | 9 passed |
| Mini App unit suite | 81 passed |
| Shared translation suite | 23 passed |
| Shared exact/display amount suite | 5 passed |
| Reverse solver and request-scoped pricing context | 16 + 1 passed |
| Pool acquisition/release/recovery tests | 7 passed |
| Worker non-overlap/draining tests | 5 passed |
| Monitoring unit and watch-registration integration after fiat guard | 21 + 2 passed |
| Production startup/termination tests | 6 passed |
| Website helper/component logic, selectors, copy, filters and XML code options | 73 passed |
| Support Bot isolated API suite | 11 passed |
| Full workspace type checks and all production artifacts | Passed |
| Six previously failing Website/Admin browser cases | All six passed focused reruns |
| Current Revenue UI, edits, fees, permissions, history and CSV | All 11 cases passed across focused runs |
| Mini App Swap/Convert and tracking | 10 passed; one conditional live-route case skipped |
| Website seven-language visible text and persistence | Passed: desktop/mobile × Light/Dark |
| Mini App seven-language visible Swap/Convert text and persistence | Passed: mobile × Light/Dark |

The final local production build was
`9b1e2d8103de-20261111091425`; it was validated, not published.

### Browser failure classification

- Landing artwork: an earlier Convert choice intentionally persisted. The test now
  explicitly selects Swap before interacting with Swap controls.
- Dedicated Convert and Convert geometry: an earlier Fixed choice intentionally
  persisted. Both tests explicitly select Floating when asserting Floating results.
- Responsive route audit: missing language/dictionary/add-on mocks were falling
  through to unrelated live Development endpoints. Their exact API contracts
  are now fixture-provided.
- Admin Revenue header: the expected old title/kicker was stale. Current title
  `Revenue` and kicker `FINANCE / REVENUE` were verified.
- Configured Swap-pair refetch: the original assertion passed in a clean focused
  rerun; no additional application defect was demonstrated or speculative
  selection/pricing change made for it.

The full Website/Admin run initially reported **76 passed / six failed**.
Failed cases were rerun after correction rather than repeatedly rerunning the
76 unrelated passes. Additional Revenue tests targeted a retired complex
Cost Basis/Details interface; they now exercise the requested current My Rates
and per-order Edit implementation, including its real `/trade` accounting
endpoint, fee preview, stable retry identity, preserved quantities and refresh.

All language expectations are resolved from the existing shared dictionary,
not a second translation system. Tests compare actual visible labels as well
as stored language and reload behavior. Languages: English, French, German,
Russian, Spanish, Korean and Ukrainian. No Arabic or RTL was added.

One Mini App test deliberately requires a real Admin-configured live route and
was skipped rather than inventing configuration or creating a live order.
Representative live read-only quote probes are listed below; this skip is not
a live-funding or payout certification.

The backend suite's 20 skipped cases are explicitly retired legacy boundaries:
exchange-owned Quickex paths, mixed Manual/Quickex configuration, former
market-provider Manual pricing fallback, and Quickex rows in Manual mutation
and directory tests. They were not executed; skipped is not passed. The dedicated
current Quickex/Manual suites remain the applicable tests.
The full API run is supplemented by accounting, Buy, reverse-solver and worker
tests that its default script does not cover.

Additional source-contract checks initially found eight outdated assertions, not
eight application defects. Their affected four files subsequently passed all
16 cases. The other 25 cases in that 41-case batch had already passed.

One ad-hoc reverse-solver test command initially omitted `NODE_ENV=test`, causing
the development logger's bundled worker transport to fail after all 16 test
bodies passed. Running the documented test-mode command passed cleanly. This was
a test invocation issue, not a customer quote failure.

## Real Development measurements

Measurements below are individual observations, not latency guarantees.

| Request | HTTP | Time |
| --- | --- | --- |
| USDT/TRC20 → EUR/SEPA Instant, send amount | 200 | 468 ms |
| Same Swap route, receive target 2,078 EUR | 200 | 129 ms |
| BTC/BTC → USDT/TRC20 Floating send quote | 200 | 649 ms |
| Same Convert route Floating receive quote | 200 | 537 ms |
| Same Convert route Fixed send quote | 200 | 266 ms |
| Same Convert route Fixed receive quote | 200 | 445 ms |
| Database readiness, 24 requests at concurrency eight | 24/24 HTTP 200 | median 19 ms; p95 235 ms; max 257 ms |
| Public Swap configuration | 200 | 557 ms |
| Public Convert configuration | 200 | 764 ms |
| XML feed | 200 | 820 ms; 1,640 items; `Cache-Control: no-store` |

All six successful financial quote requests returned signed tickets with expiry.
Tokens were not included in this report. Quotes were not submitted as live orders.

An initial Convert probe below the provider's actual minimum correctly returned
`QUICKEX_AMOUNT_TOO_SMALL`. The provider reported a minimum of 0.06782162 BTC
at that observation. Subsequent probes used in-range amounts; limits were not
changed or bypassed.

Direct, verified-TLS public Quickex requests succeeded from Development:
instrument catalog approximately 498 ms; affiliate pair page approximately 398 ms.
This proves connectivity at those instants, not uninterrupted Production service.

The public catalog contained 1,962 Swap directions and 7,656 Convert pairs.
Every Swap direction referenced existing public options. This is a catalog
integrity check, **not** a claim that thousands of live provider orders were
created. Exhaustive real-money order testing is outside this safe test boundary.

## Release and rollback procedure

1. Review this report and approve the release explicitly. Until then, do not publish.
2. The observed successful Production deployment is
   `4d791e4e-4393-48ea-bbba-d5a2766895af`, created 4 November at 22:26:51 UTC.
   Its public build manifest has `buildId: null` and `commit: null`; therefore it
   cannot independently identify a rollback source commit. Confirm the matching
   code checkpoint before publishing. The nearest earlier Git commit is only a
   candidate, not a verified deployed-source match.
3. Review the actual Publish schema diff. This patch adds no schema changes; stop
   if unrelated migrations or unexpected destructive changes are proposed.
4. Run `PORT=19375 BASE_PATH=/ pnpm run build:production`. The existing build hook
   checks workspace types and verifies Website, Mini App and API build manifests.
   Do not publish stale `dist` directories.
5. Use normal publishing only after approval. Do not invoke `MIGRATIONS_ONLY`,
   change secrets, rotate provider credentials or adjust financial settings.
6. Confirm Website and Mini App manifests and authorized `/api/admin/build-info`
   identify the new release. Check `/api/healthz` and `/api/readyz`.
7. Recheck the affected Swap route in both amount directions without creating a
   customer order. Check live Fixed/Floating Convert quotes and expiry.
8. Verify XML contains only currently valid entries. An item count alone is not
   proof of quote freshness. Confirm stale/outage cases remain non-executable.
9. Observe connection acquisition failures, checked-out component labels,
   client-hold times, rolling event-loop delay, worker non-overlap and monitoring
   lease renewal under representative traffic.
10. If readiness fails, quote correctness regresses, saturation persists or
    reconciliation becomes unsafe, stop release verification. Replit does not
    provide direct published-deployment rollback: restore the verified matching
    **code checkpoint** in the editor and republish it after approval. Keep the
    optional Development database restore disabled. Do not restore Production
    data, replay financial writes or overwrite accounting/customer records to
    roll back this code-only patch.

Platform rollback reference:
https://docs.replit.com/features/version-control/checkpoints-and-rollbacks

Production verification and rollback execution are deliberately **not performed**
without approval. Live Production Quickex timeouts and database saturation must
not be described as solved solely because Development is healthy.

## Hosting observation, not an established incident cause

Production is Autoscale. Official documentation distinguishes scale-to-zero
Autoscale services from always-on Reserved VM workers. Available minute-level
instance counts sometimes show zero while requests and runtime logs exist, so
those samples cannot prove process pauses or explain a particular pool timeout.
No per-instance lifecycle evidence establishes an Autoscale-caused stall.

If guaranteed uninterrupted polling is required, approve a separately planned
always-on worker deployment and dedicated worker bootstrap. Keep the public HTTP
API separate and preserve the current worker leases and financial fences.
No hosting setting was changed; this is an architecture risk, not a proven cause.

## Changed source and test inventory

Reverse-quote remediation already present at the start of this cycle and
reverified here:

- `artifacts/api-server/src/lib/manual-receive-quote.ts`
- `artifacts/api-server/src/routes/exchange.ts`
- `artifacts/crypto-exchange-widget/src/components/exchange-surface.tsx`
- `artifacts/quickxchange-telegram-mini-app/src/pages/exchange.tsx`
- `lib/i18n/src/quote-errors.ts`, `lib/i18n/src/index.ts`
- `lib/i18n/src/locales/{en,fr,de,ru,es,ko,uk}.ts`
- `artifacts/api-server/test/manual-receive-quote.test.ts`
- `lib/i18n/tests/quote-errors.test.ts`

Application changes in this cycle:

- `lib/db/src/operation-context.ts`
- `lib/db/src/observed-pool.ts`
- `lib/db/package.json`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/lib/draining-worker.ts`
- `artifacts/api-server/src/lib/newsletter.ts`
- `artifacts/api-server/src/lib/telegram-news.ts`
- `artifacts/api-server/src/lib/blockchain-monitoring/service.ts`
- `artifacts/crypto-exchange-widget/src/pages/admin-profit-dashboard.tsx`

Regression and isolation changes in this cycle:

- `artifacts/api-server/test/{database-pool,draining-worker,manual-buy-orders,blockchain-monitoring-service}.test.ts`
- `artifacts/api-server/test/run-api-isolated.mjs`
- `artifacts/crypto-exchange-widget/test/customer-copy-assertion.mjs`
- `artifacts/crypto-exchange-widget/test/{admin-bulk-payment-fields,deposit-details-modal,order-created-quote-visibility,swap-widget-regression}.test.mjs`
- `e2e/{landing-background,live-quote,responsive-layout,order-profit,order-profit-trade,telegram-mini-app-ui}.spec.ts`

Generated review screenshots are excluded from Git and publishing using
`.gitignore` and `.replitignore`. They are not runtime assets.

The pre-existing generated Canvas component change was left untouched.
