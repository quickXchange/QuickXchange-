# QuickXchange stabilization — implementation and verification

Date: 2026-10-14 UTC. Changes are in the workspace, not published by this investigation.

## Implemented

### Safe PostgreSQL connection recovery

- Retry a transient physical connection-acquisition failure at most once, before a client is returned to any SQL caller.
- Handle startup handshake timeouts, interrupted startup sockets and reviewed transient network/server-startup error codes.
- Do not retry exhausted pool queues, authentication failures, statements, transactions, or uncertain financial writes.
- Expose connection retry/recovery counts alongside existing acquisition and event-loop metrics.
- Preserve callback/Promise behavior, failed-client disposal, pool bounds and shutdown.

Real TCP fault-injection tests confirm recovery, bounded exhaustion and authentication handling. A synthetic write is submitted exactly once after a failed handshake; a socket lost after submission is not retried.

### Independent API startup

- Quickex remote verification no longer blocks the listening port.
- Its synchronous runtime-proof invalidation still runs before requests can be served.
- Convert remains unavailable until the existing credential proof succeeds.
- Shutdown prevents in-flight verification from scheduling another timer.

Real Development startup logs show the server listening at 23:18:28.227 UTC, before the pending Quickex timeout. Previously the timeout completed before the server could listen. An HTTP regression test also serves a successful request while verification remains unresolved.

### XML discovery tolerance and diagnostics

- Raised the executable-catalog discovery budget from 1 to 3 seconds. Successful Production config requests measured 986–1,218 ms server-side, so the former limit could reject a healthy catalog.
- Added a recognizable `XML_DISCOVERY_TIMEOUT` code and sanitized XML-worker failure codes without logging credentials or provider payloads.
- Rate expiry, executable-direction checks, retained recovery data and exclusion of stale financial rates are unchanged.
- Added the connectivity regression group to the normal API test command.

## Verification results

| Coverage | Passed | Skipped |
|---|---:|---:|
| WhiteBIT unit/history/integration/Swap, schema-only disposable database | 114 | 0 |
| Quickex/provider/order regressions, disposable database | 70 | 20 |
| Customer status notification regressions, disposable database | 3 | 0 |
| PostgreSQL real-driver TCP fault injection | 7 | 0 |
| Quickex transport deadlines, socket cleanup and recovery | 7 | 0 |
| XML freshness, executable routes and publication boundaries | 26 | 0 |
| Telegram Fixed/Floating confirmation and QR deduplication | 5 | 0 |
| Background verification startup/recovery/shutdown | 2 | 0 |
| XML catalog discovery budget | 2 | 0 |
| XML bounded refresh/cache/configuration fencing | 7 | 0 |
| **Total** | **243** | **20** |

The 20 skipped Quickex cases are existing explicitly obsolete tests, not successful live checks.

WhiteBIT tests cover exact pending-order matching, TRON aliases, confirmation evidence, authenticated orphan recovery, tracking projection, duplicate-credit prevention and separation of funding from independently confirmed payout. The runner confirmed Development provider settings, credentials and routes were unchanged.

Shared-library, API, scripts, Website and Mini App type checks passed. The production build completed and verified both web artifacts and the API. Relevant tests were rerun after their corresponding code changes; unrelated previously passing suites were not repeatedly rerun.

### Actual Development database observation

The dedicated read-only probe used the existing restricted runtime-role connection configuration. Every sample closed only its own client, requiring another physical connection on the next sample.

- Window: 23:09:34.475–23:11:33.281 UTC.
- 60/60 newly authenticated connections and `SELECT 1` reads succeeded.
- Median connection-plus-read: **10.59 ms**; maximum: **54.17 ms**.
- Final pool clients / idle / waiting: **0 / 0 / 0**.
- No acquisition failures or retries were needed during this observation.

This validates the observed Development path, not sustained Production stability. The new read-only probe refuses Production execution.

### Actual Production Convert verification

Production became reachable during this investigation after a runtime restart observed in deployment logs. The agent did not publish, restart Production, rotate credentials or change provider configuration.

Fresh quote requests for BTC/BTC → USDT/TRC20, source amount 0.01:

| Mode | UTC | HTTP | End-to-end |
|---|---|---:|---:|
| Fixed | 23:12:41.534 | 200 | 854 ms |
| Floating | 23:12:42.033 | 200 | 497 ms |

Both responses preserved the requested source amount, returned the correct mode, a positive receive amount, a signed quote identifier and a future expiry. These were quote-only calls: **no provider/customer order was created**. Production logs independently record successful quote responses.

Current Production success does not prove the earlier network problem is permanently fixed. Development's four Quickex IPv4 destinations still timed out at TCP connection establishment in fresh probes at 23:06:42 UTC.

### Public application checks

- Website, Admin and Mini App entry pages returned HTTP 200 in Development and Production.
- Development API/database readiness returned 200 in 6 ms each; Production readiness returned 200 in 69 ms in the sampled pass.
- Anonymous protected Admin and Mini App APIs returned 401 as expected.
- The public Website was screenshot-checked, and a browser DOM check confirmed the active Swap layer, inputs and positioning.
- HTML timings are not authenticated journey or rendering timings. The Production Website's first sampled request took 10.329 seconds during cold startup; this is not represented as a fast-page result. The startup change is intended to remove its Quickex-verification dependency, but needs approved publication before a Production before/after claim is possible.

## Remaining blockers and exact actions

### 1. Development Quickex network path

All four addresses timed out before TLS:
`159.65.49.147`, `165.22.196.213`, `64.226.113.6`, `87.199.207.128`.

**Hosting request:** Correlate Development TCP/443 attempts at 23:06:42–23:06:47 UTC with NAT and outbound firewall/flow records. Identify actual source egress and whether SYNs leave and SYN-ACKs return. Compare this with the successful Production quote window above.

**Quickex request:** Check edge/firewall/allowlist records for those verified source addresses and timestamps. Confirm whether a cloud/source-IP/ASN/geographic policy rejects Development while permitting the current Production runtime. Also distinguish public catalog/signed quote access from affiliate `/api/v2/pairs/all` and `/api/v2/rates/public/one` access.

A workspace control-request IP is not a permanent Production allowlist source. Do not bypass TLS or send financial traffic through an unapproved proxy.

### 2. XML is not yet reliably available in Production

Live observations alternated between HTTP 200 with 13 items, HTTP 503, HTTP 200 with 4 items, and HTTP 503. Successful customer quotes therefore do not certify the separate partner-JSON XML pipeline.

The one-second discovery budget is an application-side contributor addressed in the workspace. Existing published logs hide the exact failure behind a generic warning; the new sanitized failure code will distinguish discovery timeout from other publication failures after approved publication. Partner endpoint access still needs independent verification if that failure persists.

No stale, unexecutable or invented direction was intentionally advertised to conceal failures.

### 3. Production database recovery requires an approved rollout and observation

The new recovery/startup/XML code has not been published by the agent. Production connection failures cannot be declared resolved from Development tests or healthy later readiness samples.

After approved publication, observe deployed acquisition-start/end metrics, recovery counts and event-loop delay, correlated with hosting CPU/memory/network events and PostgreSQL gateway logs. Production SQL diagnostic replicas do not expose the live application's pool occupancy.

### 4. Production blockchain readiness is not fully certified

Published ERC20/BEP20 readiness probes also logged provider failures, including ERC20 chain-ID/block-number calls at 23:20 UTC. Development Polygon RPC calls succeeded, but that does not establish the health of other networks or environments. These failures must not be presented as passed monitoring checks or attributed to PostgreSQL without evidence.

Exact RPC response/status diagnosis requires the authorized Production RPC/Owner diagnostics path. No RPC credentials, provider selection, financial settings or route eligibility were changed to bypass the failure.

## Safety and scope

No Production data, financial settings, credentials, DNS, pricing/markup, orders, balances, monitoring rules or settlement logic were deliberately changed. No live orders, real deposits, payouts or customer notification messages were generated. Live payment/order-creation journeys were exercised only through isolated fixtures; unchanged authenticated Website/Admin/Support Bot/Mini App browser suites were not recertified in this pass.

**Result:** application-side recovery, startup and XML-discovery fixes implemented and tested; fresh Production Fixed/Floating quotes verified; full Production stabilization remains conditional on approved rollout and network/XML follow-through.
