# QuickXchange connection reliability report

Date: 2026-10-14. Changes are in the workspace, not published.

## Status

- Application transport/pool hardening and covered regression checks: **PASS**.
- Live Quickex reachability: **BLOCKED**.
- Production database at the measurement time: **healthy**, but the historical connection-establishment failures' underlying infrastructure/runtime cause is **not conclusively identified or proven fixed**.

No credentials, Production settings/data, pricing, financial calculations, DNS, settlement, or order statuses were changed. No customer messages, live orders, or payouts were generated.

## Confirmed findings

### Quickex

DNS resolves four IPv4 addresses: `159.65.49.147`, `165.22.196.213`, `64.226.113.6`, and `87.199.207.128`. Certificate-verifying HTTPS probes to the official hostname, pinned separately to each address, all timed out at approximately 4,001 ms **before TCP connected**, with no TLS handshake or HTTP response.

Control HTTPS requests succeeded:

- Telegram: TCP 107 ms, TLS 227 ms, response 334 ms.
- Coinbase: TCP 13 ms, TLS 36 ms, response 73 ms.

This establishes destination-specific reachability failure from this workspace, not a general HTTPS outage or rejected credentials. Client-side probes cannot distinguish outbound filtering from provider-side filtering/allowlisting or another fault along the path. No TLS bypass, alternate proxy, credential rotation, or unsupported provider endpoint was used.

Production separately logs `QUICKEX_NETWORK`; three real public Convert configuration requests returned HTTP 503 with a 5,004 ms median. The published build does not yet have the new transport-stage telemetry, so its exact failing network stage cannot be proven from those logs alone.

### PostgreSQL

The retrieved historical deployment-log sample contains 68 physical connection-establishment timeout records and 6 pool-acquisition timeout records. The latest retrieved physical timeout was at 21:24:20 UTC. Several different workers failed, so this is not isolated to one order or one SQL statement.

The configured connection-establishment/acquisition timeout is 5 seconds. Physical handshake failures occur before the requested SQL executes. End-of-error pool counters sometimes show idle clients and zero waiters; these are snapshots **after** failure, not proof of what happened throughout acquisition.

Read-only managed Production SQL diagnostics at investigation time showed:

- 9 total connections, including system connections, against `max_connections = 450`.
- 0 idle-in-transaction sessions.
- 0 ungranted locks.
- Three real `/api/readyz` requests passed; median HTTP round trip 74 ms, with approximately 48 ms server response time in matching deployment logs.

The current snapshot does not support pool exhaustion or a currently blocked SQL query as the cause. It cannot retrospectively identify a transient database gateway/network failure, delayed handshake, or application event-loop/resource stall. No Production backend was terminated and no schema/index/settings were changed.

Development restricted-role measurements:

- Three new cold acquisitions: 19.22, 9.25, and 9.26 ms.
- Fifteen warm `SELECT 1` round trips: 0.25–1.99 ms.
- Each test pool finished with one idle reusable client and zero waiters, then was closed.

## Application fixes

1. Quickex now has an absolute **per-request** network budget covering DNS waiting, TLS selection, HTTP response/body completion, and any safe read retry. Previously DNS/probing was outside the request timeout, the HTTPS timeout was socket inactivity rather than total duration, and a retry received a fresh full budget.
2. Losing TLS probes are destroyed immediately after a winner is selected; errors remain handled during asynchronous socket closure.
3. Stalled or interrupted response bodies fail explicitly instead of remaining unresolved or extending indefinitely through trickled data.
4. Concurrent reachability discovery is shared. Only a reachability failure is coalesced for two seconds to avoid immediate repeated probe bursts; **no financial response or empty catalog is synthesized**. Recovery is retried after that short window.
5. Read retries cannot exceed their request budget; HTTP 429 still is not immediately retried. Irreversible creates remain single-attempt, with uncertain outcomes preserved.
6. Existing PostgreSQL pool size, idle lifetime, five-second acquisition limit, query semantics, and transaction behavior were retained. TCP keepalive now has an explicit 10-second initial delay rather than relying on the operating system's potentially multi-hour default.
7. PostgreSQL telemetry now records successful/failed acquisition counts, slow acquisition durations, counters before/after slow acquisitions, and event-loop delay. The documented driver callback/Promise/release/end interfaces remain unchanged.
8. Worker telemetry now distinguishes Quickex exceptions from database failures. Twelve records in the retrieved historical sample were generic “database query failure” classifications, including provider-network exceptions; that label alone was misleading.

No SQL transaction or financial write was given an automatic retry. No pool limit was increased without evidence. No inefficient SQL rewrite was justified by the observed establishment failures, which happen before SQL execution.

Receive-limit discovery may perform its existing separate amount-free lookup. The per-request network budget does not change that financial validation contract.

## Real response measurements

Three sequential samples per HTTP endpoint. Measurements include the response body, not browser rendering, full navigation, or authenticated customer/operator work. The two runs had different cache/process/load conditions; their difference is **not controlled causal proof** of an improvement.

| Operation | Development before | Development after | Existing Production build |
|---|---:|---:|---:|
| Website HTML | 24 ms | 13 ms | 90 ms |
| Admin HTML | 34 ms | 10 ms | 79 ms |
| Mini App HTML | 19 ms | 11 ms | 24 ms |
| Shared API liveness | 7 ms | 7 ms | 88 ms |
| DB-backed readiness | 7 ms | 7 ms | 74 ms |
| Public Swap configuration | 803 ms | 478 ms | 762 ms |
| Convert configuration | 8 ms, 503 | 12 ms, 503 | 5,004 ms, 503 |

Fast HTTP 503 responses are not successful Convert quotes.

Actual Exchange Bot credential-path `getMe` + `getWebhookInfo` calls completed successfully in 383, 322, and 110 ms (322 ms median). These were parallel read-only Telegram calls, not command/message-delivery measurements. No webhook was registered and no messages were sent.

Admin diagnostics and Mini App order endpoints correctly returned 401 without authentication. Their auth-gate timings were measured but are **not authenticated Admin/order-flow timings**. Those end-to-end timings remain unverified in this pass.

Reproducible public HTTP measurements:

```sh
node scripts/measure-live-endpoints.mjs https://quickchange.exchange/ 3
```

The Telegram measurement script uses the existing server-side credential path and prints only timings and success flags.

## Verification

- New transport tests: **7/7 PASS**, including DNS deadline, TLS loser cleanup, concurrent discovery, stalled bodies, failure cooldown/recovery, and HTTPS SNI/certificate settings.
- Pool/telemetry tests: **3/3 PASS**, including callback/Promise reuse, release/end, queued acquisition timeout cleanup, and failed physical handshake cleanup.
- Existing Quickex/API suite: **70 applicable cases PASS**, **20 pre-existing skipped cases**. Two assertions expecting an extra retry after the fixture's 30 ms budget were corrected and rerun; precision and limit/error assertions remain intact.
- XML/public-provider regression tests: **46/46 PASS**.
- Total distinct applicable automated checks: **126 PASS**.
- All workspace type checks and final production builds: **PASS**.
- API workflow restarted once after the application changes and serves requests normally.
- Real Website preview renders correctly; its unavailable Convert request remains an explicit 503, not stale live rates.

## Remaining release limitations

1. Quickex needs destination reachability restored. Determining which firewall/network/provider owns the drop requires evidence from that network owner; changing application credentials cannot fix a TCP connection that never establishes.
2. The intermittent Production PostgreSQL incident needs incident-time acquisition/event-loop metrics from the updated application. Current healthy read-only snapshots are insufficient to prove its historical root cause or resolution.
3. The workspace fixes have not been published. Production measurements above are a baseline from the existing build, not post-fix Production results.
4. Successful live Convert quotes and fully authenticated Admin/Mini App timings cannot honestly be marked PASS from these unauthenticated/read-only measurements.
