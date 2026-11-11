# QuickXchange Production release verification

## Phase 1 — Pre-Republish, 11 November 2026

**Preflight: PASS for a controlled, user-initiated Republish.**
**Post-release health: PENDING — Republish has not been observed.**

No publishing, Production restart, database reset, financial setting change,
test order or customer message was performed.

### Release contents

The stabilized application is committed at
`61d636ab1dc82a86713bf5d6fa7e45e764778a4b`, including the ancestor reverse-quote
fix. Confirmed contents include:

- Bounded receive-target solver progress and signed fresh-quote gating.
- Website/Mini App quote recovery and seven-language error messages.
- Single-flight newsletter/news workers, shutdown draining, pool checkout
  attribution and rolling event-loop diagnostics.
- Explicit fiat-source exclusion from blockchain watch registration.
- Revenue mobile table scroll hint and completed regression updates.

This preparation adds only build-manifest identity recovery and three isolated
tests. Artifact-specific rebuilds previously wrote null source identifiers when
they did not inherit the root hook's environment. They now recover the source
commit from Git when no explicit build metadata is supplied. Existing explicit
release identifiers retain priority. No financial application code changed.

The Republish may use a later checkpoint containing these preparation files;
verify its source is the stabilized commit or a descendant with these files.

### Fresh build verification

- `node --test scripts/verify-web-build.test.mjs scripts/production-api-start.test.mjs`:
  **9 passed, zero failed/skipped**.
- `PORT=19375 BASE_PATH=/ pnpm run build:production`: **PASS**.
- Local validation build: `61d636ab1dc8-20261111094717`.
- Workspace type checks, Website, Mini App and API production artifacts passed.
- The API's ordinary production entrypoint does not execute migrations.
  Do not set `MIGRATIONS_ONLY=true` or invoke a reconciliation job for this release.

The full stabilization evidence remains in
`QUICKXCHANGE_STABILIZATION_RELEASE_REPORT.md`; it is not being represented as a
new run of all those tests.

### Production database compatibility

Read-only publishing diff: **two additive indexes**, no drops, truncations,
column removal or reported incompatible changes:

- `order_profit_my_rate_current_idx`
- `order_profit_my_rate_request_idx` (unique request identity)

Read-only Production checks found zero duplicate request-ID groups, neither
index already present, and zero rows in the indexed `order_profit_rates` table
at inspection. No customer, order, wallet, pricing, Revenue input or account row
was modified. Publishing may apply these non-destructive indexes through its
normal schema flow. If its actual dialog proposes anything else, stop for review.

### Verified rollback source

Latest listed successful deployment:
`4d791e4e-4393-48ea-bbba-d5a2766895af`, created 4 November 2026, 22:26:51 UTC.

Its build log explicitly identifies:
`0692d0bb789cddbdcfe84169c8049113b23752b8`.

The Git object exists locally and is an ancestor of the stabilized source.
This establishes the build-to-source mapping, correcting the earlier report's
unverified-candidate status. Deployment metadata does not expose a direct active
revision ID; the current public manifests still show 4 November build timestamps
with null identifiers, consistent with that latest listed build.

Rollback procedure: select the matching code checkpoint, leave database restore
disabled, and republish that code only after approval. Replit does not provide a
direct rollback of a published deployment. Do not restore Production data or
reverse the additive indexes to roll back this application release.

### Pre-release operational baseline

Observed runtime window: 11 November, 09:35–09:45 UTC.

- Pool acquisition timeout at 09:41:56 UTC: 6,398 ms; total ten, idle zero,
  six waiters. Nearby acquisitions took 3–7.3 seconds.
- Old event-loop histogram p99/max: 39,326/79,323 ms. These are not incident-local.
- Quickex worker failures: `QUICKEX_TIMEOUT` at 09:38 and `QUICKEX_NETWORK` at
  09:39. Their pool snapshots had 7–8 idle clients and no waiters; these particular
  provider failures do not coincide with pool exhaustion.
- Sparse HTTP metrics showed two requests and no 5xx, which is not a recovery proof.
- A fresh public browser capture reached the application's existing
  **Verification Required** password gate, not the exchange screen. That gate
  was not disabled or bypassed. Authenticated UI checks need authorized access.

These conditions must be compared with the newly published runtime. Preflight
does not certify they are fixed in Production.

## Phase 2 — After the user confirms Republish succeeded

1. Establish the new successful deployment ID, source commit and live manifests.
   Verify Website and Mini App are actually on the new source, not a cached old
   page. Compare API build identity through authorized diagnostics when available.
2. Check health/readiness, Website navigation and the Mini App.
3. Confirm USDT/TRC20 → EUR/SEPA Instant quotes for both send input and receive
   target. Verify valid signed expiry and Continue gating, including the original
   2,078 EUR target; never treat the screenshot's old amount as an executable quote.
4. Check live in-range Fixed and Floating Convert quotes in both amount directions.
   Do not submit quotes as funded orders.
5. Check tracking and Revenue read-only under the appropriate authenticated role,
   without modifying statuses, rates, costs or customer records.
6. Verify order creation through isolated fixtures. A real unfunded Production
   order requires separately approved test details and destinations; do not invent
   a wallet, use a customer's destination or trigger a payout/email as a test.
7. Inspect new-revision API errors, checkout durations/components, acquisition
   failures, worker overlap/leases, rolling event-loop diagnostics and Quickex
   failures over a bounded observation window.
8. Report PASS/FAIL/UNVERIFIED per flow. If a safe application fix is necessary,
   implement/test it in Development and request another user-initiated Republish.
   Never silently change financial settings or the running release.

The final Production health result will be appended here after Phase 2.
