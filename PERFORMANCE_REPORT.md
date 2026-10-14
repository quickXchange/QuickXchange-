# QuickXchange Performance Optimization Report

Date: 2026-10-14

## Result

**Workspace optimization and covered regressions: PASS.**

**Live end-to-end performance: BLOCKED by external-service/runtime issues.**

The changes are in the workspace only. Nothing was published. No Production configuration, credentials, customer records, pricing, settlement, financial operations, or DNS were changed.

This report distinguishes measured improvements from functional regression checks. It does not claim that every live operation is instantaneous or that an exhaustive Production load test was performed.

## Measured before and after

Production entry JavaScript was compared against the existing pre-change build. Gzip values are calculated offline; actual transfer encoding depends on the hosting proxy.

| Measurement | Before | After | Improvement |
|---|---:|---:|---:|
| Website entry JavaScript, uncompressed | 2,532,857 bytes | 1,373,808 bytes | 45.8% smaller |
| Website entry JavaScript, gzip | 817,829 bytes | 308,062 bytes | 62.3% smaller |
| Mini App entry JavaScript, uncompressed | 816,592 bytes | 674,100 bytes | 17.4% smaller |
| Mini App entry JavaScript, gzip | 256,630 bytes | 217,450 bytes | 15.3% smaller |
| Website selector: 300 searches over 1,000 synthetic options | 180.17 ms | 7.62 ms | 23.6× faster |
| Mini App selector: same synthetic workload | 296.41 ms | 15.74 ms | 18.8× faster |
| English dictionary requests within one Mini App bootstrap | 2 in the previous implementation | 1 observed in browser verification | Duplicate eliminated |

Search timings are median local CPU measurements over five warmed samples. Both algorithms run against the same synthetic data in the same invocation. They are not mobile-device latency, Production API timing, or network measurements. Index construction is excluded from warm search timing and occurs when the catalog changes.

Entry-script savings do not represent the entire application's JavaScript or all subsequent navigation downloads. Deferred screens and the PDF renderer still load when needed.

Reproduce build and synthetic measurements:

```sh
BASE_PATH=/ PORT=19375 pnpm run build:production
node scripts/measure-performance.mjs
```

The measurement script reads generated frontend build assets and synthetic search data only. It does not inspect secrets, customers, orders, or databases.

## Implemented improvements

### Website and Admin

- Deferred PDF/font-engine imports until Download PDF or Print is requested. Existing invoice generation, popup handling, errors, and completion checks remain intact.
- Indexed normalized selector text once per catalog update instead of repeatedly normalizing each option on every keystroke.
- Coalesced selector scroll/resize measurements through animation frames, including cleanup of pending frames.
- Preserved selected routes, search text during catalog refresh, option order, partial/accent-insensitive matching, and overlay presentation.
- Retained the existing design and image files. No logo quality reduction, rasterization, or cosmetic redesign was introduced.

### Telegram Mini App

- Kept the Home shell at startup and split Exchange, Orders, Order Detail, Track, Account, and Support into on-demand screens.
- Retained authentication and query providers outside the lazy screen boundary.
- Added a translated screen-loading state within the existing shell.
- Indexed source and target selector search fields per catalog update. Fields remain separate to prevent accidental cross-field matches.
- Preserved canonical symbols, network codes, exact quote inputs, signed order amounts, and existing quote expiry/recovery behavior.

### Shared languages

- Reused the selected dictionary request when selected language and fallback language are identical.
- Kept different language/fallback loads concurrent.
- Added no retained dictionary cache: Admin revisions and enabled-language changes retain their existing freshness behavior.

### Backend, Exchange Bot, and Support Bot

- Parallelized independent read-only Telegram identity/webhook health probes.
- Preserved separate error reporting for Exchange Bot probes and fail-closed Support Bot identity validation.
- Parallelized the Mini App's independent Manual/Convert order reads.
- Replaced repeated order-array scans with separate Manual and Convert ID maps. Chat-scoped authorization and verified funding projections remain in place.
- Did not cache order status, quotes, funding evidence, permissions, or payment-processing results.
- Did not change webhook registration, notification delivery, retry/idempotency rules, provider selection, payout handling, or monitoring.

## Verification

### Automated checks

| Check | Result |
|---|---|
| Website selector unit tests | 7/7 PASS |
| Mini App unit/rendering tests | 81/81 PASS |
| Shared language tests | 21/21 PASS |
| Exchange Bot, Convert creation/catalog, tracking, and notification settings tests | 51/51 PASS |
| Support Bot isolated tests | 11/11 PASS |
| Website access-gate tests | 7/7 PASS |
| Production startup tests | 6/6 PASS |
| Full workspace TypeScript checks | PASS |
| Production Website, Mini App, and API builds with output verification | PASS |
| Whitespace/diff checks | PASS |

**184 automated unit/integration/startup checks passed.**

Backend tests used disposable databases and mocked provider calls. No real customer messages, live orders, payouts, or Production writes were made.

### Browser coverage

| Surface | Result and scope |
|---|---|
| Website | 23 focused cases pass across quote flows, selector/logo behavior, and completed-order receipts, after correcting outdated assertions and rerunning affected cases. |
| Admin | Mocked Owner completed-order drawer/PDF download verification passed. This was not an exhaustive audit of every Admin tab. |
| Mini App | 11 fixture-based cases pass; 1 live-provider-dependent case intentionally skipped. |
| Mini App responsive navigation | Home → Exchange → Orders → Track → Account → Support settled successfully at 375, 768, and 1280 px, without horizontal overflow. |
| Language startup | One English dictionary request observed in a single bootstrap. |
| Selector refresh | Open Website search query and visitor-selected pair survived an exchange-config refetch. |

Browser tests exercised the real UI with isolated API/session fixtures. They do not demonstrate successful live Quickex order creation.

### Test-harness corrections

- Static Mini App logo tests had no client language bootstrap. Their Node-only loader now uses the real English dictionary for isolated rendering assertions; browser tests and shared language tests retain the actual production provider.
- Receipt assertions were updated to the existing approved contract: Completed status, full support URL, authorized incoming Manual TXID, and omission of unverified Convert rate/fee fields.
- The uploaded-logo test now targets the payment artwork rather than the accompanying country flag, and checks the existing shared adaptive frame.
- These corrections did not change invoice contents, financial calculations, logos, or application design.

## Remaining confirmed blockers and limits

1. **Quickex connectivity:** Development logs show `QUICKEX_NETWORK` during catalog/bootstrap requests, with Convert unavailable while provider verification is incomplete. XML provider refreshes also report unavailability. No stale rates were relabeled as live, and no credential or provider configuration was changed.
2. **Production database connection failures:** Existing deployment logs show physical connection-establishment timeouts, including a Convert notification worker with waiting count zero. These observations do not prove an inefficient SQL query or justify increasing connection limits. Production infrastructure/configuration was left unchanged.
3. **Live provider timing remains unverified:** External connectivity prevents a truthful claim that live Convert/XML operations are fully validated or instantaneous.
4. **Scope of measurement:** No Production stress test, universal device benchmark, or comprehensive Core Web Vitals field study was performed. Build-size and synthetic search improvements are measured; real UI flows were regression-tested with fixtures.

Financial correctness, authentication, permissions, quote precision/expiry, status authority, deposit evidence, and monitoring must remain authoritative. Speed improvements must never replace those checks with stale cached values.
