# Production integration review: wallet registration and provider assignment

Review date: 2026-10-15. Production checks were read-only, point-in-time checks.

## Decision

**Application/schema integration: PASS. Full live Production operational readiness: FAIL.**

The new cross-action safeguards are workspace changes, not published by this review. Existing Production RPC readiness failures remain unresolved and must not be represented as successful live verification.

## Migration 0150

- Production PostgreSQL reports version 160015.
- Both new tables already exist in Production. Their 13 columns, defaults/nullability, six validated constraints and three valid/ready indexes match Development.
- The UUID default and the session/transaction advisory-lock functions required by the integration are available to the checked database role.
- Production uses the existing `USE_DATABASE_OWNER=true` runtime mode. This review does not change credentials, grants or that mode.
- At inspection: zero configuration targets, zero registrations, zero orphan/mismatched registrations and zero queued/running provider-switch routes.
- The exact migration hash has no Production Drizzle-journal entry. This is schema/history divergence, **not missing schema**. Do not replay raw 0150 or the complete Drizzle history. Use the managed Publish schema diff, which should not need these objects created again.
- The migration is additive: no financial-table rewrite or customer/order data migration.

An isolated schema-only fixture rehearses the exact SQL, UUID defaults, shared-target uniqueness, delete restrictions, monitor-asset `SET NULL`, a mid-migration DDL failure and full transaction rollback. The original table identities and order/watch counts are restored afterward.

## Integration defect corrected

A provider assignment could previously be admitted after a wallet save temporarily disabled deposits but before its RPC verification completed. That assignment could incorrectly capture OFF as the original customer-deposit state. Individual provider retries also needed the same admission guard.

The corrected workflow excludes overlapping wallet saves, new assignments and individual retries throughout remote verification. Provider jobs already queued/running still fence wallet saves in the reverse direction. Duplicate wallet submissions fail fast. Existing Owner/version and exact-configuration checks remain in force.

Coordination uses a bounded dedicated control session, not a long-running SQL transaction or a pinned shared application-pool connection. Session termination releases locks; detected session loss prevents subsequent activation.

The concurrency regression pauses a real mocked RPC request while a wallet save is in flight. It verifies that duplicate saves, new provider jobs and individual retries are rejected without enqueueing conflicting work, then releases RPC and verifies the requested ON state is restored.

## Verification

- 60 provider/wallet integration cases verified, including shared BEP20 targets, WhiteBIT standby, Manual activation, saved-state checks, old frozen-watch preservation, failures and cross-action concurrency. A test-only missing import was corrected and the affected concurrency case rerun.
- One migration/rollback rehearsal passed in a disposable database.
- One actual scheduler/consumption integration passed in a disposable database.
- One legacy Owner receiving-wallet API case passed after updating only its synthetic fixture cleanup for the new restrictive foreign key. The prior cleanup failure left its test server open; the stale broad test workflow was stopped, not misreported as a complete passing suite. In total, 63 relevant distinct cases are verified; unrelated full-project coverage is not claimed.
- Shared-library/API type checks, Website type check, API production build and Website production build passed.
- Existing desktop/mobile browser checks from the preceding implementation remain applicable: no UI code changed during this review. They were not redundantly rerun.
- No live address-permission requests, customer orders, deposits, payouts or customer messages were generated.

## Remaining Production findings

| Network | Confirmed issue | Configured Manual customer-deposit routes ON | Active financial watches |
|---|---|---:|---:|
| BEP20 | RPC quota/rate limit | 0 | 3 |
| ERC20 | RPC quota/rate limit | 3 | 0 |
| TRC20 | Configuration failure; no saved endpoint reference | 1 | 0 |
| BTC | EVM adapter selected; no endpoint or chain identity saved | 0 | 0 |
| POLYGON | No connected proof, endpoint reference or chain identity | 0 | 0 |

BEP20 has three enabled WhiteBIT deposit routes and no effective Manual fallback; new WhiteBIT deposits do not justify retiring the three existing financial watches. TRC20 also has one enabled WhiteBIT route with effective Manual fallback. Configured ON is not a successful current readiness proof. These counts do not prove whether a watch has real unpaid obligations; do not close or disable watches from counts alone.

The final read-only deployment log check also found current runtime failures, not merely old counters:

- At 18:42:22 UTC, a pool acquisition timed out after 13,993 ms with all ten pooled connections occupied; the customer-notification cycle failed. Event-loop-delay metrics were also elevated. These observations do not establish a database-server root cause.
- Recent Quickex HTTP/TCP-TLS timeouts and XML discovery timeouts were recorded around 18:40–18:42 UTC.
- A monitoring health update reported lease loss at 18:39:59 UTC.

These failures occurred in the existing deployment before publication of the reviewed fixes. Schema compatibility does not certify runtime stability, and this integration review does not claim to have resolved their underlying causes.

## Rollback readiness

**PASS for additive-schema/application rollback design and isolated transactional rehearsal. Production database restore: not performed.**

Workspace baseline before these review fixes: `92574debc790eecc07c9a07fbdaefe640f3f9fac`. This identifies the workspace baseline, not a proven matching deployed build.

Before an application rollback, stop new bulk actions and allow durable jobs to finish. Restore only the selected application revision, retaining both new tables, their schema declarations/migration artifacts, all financial records, wallets and provider settings. Review the Publish diff so a code rollback cannot propose dropping additive tables. Do not replay migrations or overwrite Production with Development data.

Application rollback does not undo Owner configuration changes. Restore any intended configuration through the existing authorized controls after reviewing current obligations. A database point-in-time restore is a separate disaster-recovery operation and can lose newer financial records; it is not the normal rollback for this change. A Production restore-point/restore rehearsal was not verified in this read-only review.

## Exact remaining actions

1. Restore ERC20/BEP20 RPC capacity or approve a healthy configured alternative, then run live network/asset verification. Preserve the three BEP20 watches.
2. In Network Monitor, select the correct existing TRON endpoint reference and any provider-required API-key reference; verify its exact asset mappings and readiness before enabling/restoring Manual intake or fallback.
3. If BTC/Polygon Manual deposits are intended, correct BTC to the Bitcoin adapter and configure the appropriate endpoint/chain identity and exact asset mappings; configure Polygon's endpoint and chain identity. Verify before enabling deposits.
4. The Owner must approve publication of the reviewed application fixes. No manual 0150 application is required. Review the schema diff for unrelated/destructive changes; never select data overwrite.
5. After the release and RPC recovery, use the Owner controls to run the existing live provider/readiness checks and verify final provider, monitoring and customer-deposit states. No real funded order is needed for this configuration verification. Select the prior successful application release and confirm the recovery plan before approving rollout.
6. Before declaring the whole Production service healthy, resolve and re-observe the current pool/event-loop and Quickex/XML timeout failures. Do not attribute them to 0150 without evidence or hide them with stale quotes. Additional application diagnostics can be read-only; Production resource/configuration changes or publication still require approval.

No Production data, credentials, provider assignments, financial settings or DNS were modified. Nothing was published.
