# QuickXchange Alchemy usage audit

Audit date: 2026-10-15 UTC. Production access was read-only.

## Executive findings

1. WhiteBIT-managed deposits already use authenticated WhiteBIT events and
   signed deposit-history verification, not Alchemy transaction verification.
   No blockchain watches for WhiteBIT-managed deposits were found in either
   environment's inspected watch records.
2. Production is **not entirely WhiteBIT-managed**. It retains Manual deposit
   routes and three active Manual BEP20 watches: **BNB, USDC and USDT**.
   The USDC watch is a historical Manual order despite today's WhiteBIT catalog
   selection. Its assigned address cannot be adopted by WhiteBIT events.
3. Enabled EVM monitors performed a full RPC readiness probe on each scheduler
   cycle, approximately every 15 seconds, including networks without watches.
   The previous worker also immediately repeated the head read. This can consume
   the entire free allowance without customer transactions.
4. Idle readiness polling is now reduced safely. Active watches, confirming
   evidence, recent applied reorg checks and eligible registration gaps stay on
   the operational cadence.
5. The exact historical allocation of the reported 30 million CUs is
   **not recoverable from application source or the available database**.
   Alchemy account-level app/method usage is needed to reconcile the invoice.
   The calculations below are explicit workload forecasts, not invented billing
   measurements.

## Networks and assets identified

### Production configuration snapshot

| Network / reference | Monitored asset routes | Current catalog ownership | Active chain work |
| --- | --- | --- | --- |
| ERC20 / `ETHEREUM_MONITOR_RPC_URL` | ETH, USDC, USDT | Manual customer-deposit routes | No active watches; no confirming/recent applied matches |
| BEP20 / `BSC_MONITOR_RPC_URL_V2` | BNB, USDC, USDT | BNB and USDT Manual; USDC WhiteBIT | Three active historical Manual watches, one for each asset |
| BTC | BTC | Manual, customer deposits disabled | No configured endpoint |
| POLYGON | POL | Provider none, customer deposits disabled | No configured endpoint |
| TRC20 | TRX, USDT | TRX Manual; USDT WhiteBIT with Manual fallback | No configured endpoint; no active watches |

ERC20 and BEP20 poll settings are 15 seconds, with an offset of 9: ten inclusive
blocks per token range. Their monitor asset rows are enabled.

Twelve BEP20, two ERC20 and three TRC20 historical applied matches were present;
none was inside the current one-hour applied-evidence reorg refresh window.
There were no confirming matches. They remain stored and were not deleted.

### Development configuration snapshot

| Network | Enabled monitored assets | Workload / provider classification |
| --- | --- | --- |
| ERC20 | DAI, ETH, USDC, USDT | Runtime endpoint classified as Alchemy. Current catalog WhiteBIT; USDT Manual fallback remains opted in. No active watches. |
| BEP20 | BNB, USDC, USDT | Runtime endpoint classified as Alchemy. Current catalog WhiteBIT; USDC Manual fallback opted in. Five legacy Manual watches: three BNB and two USDT. |
| POLYGON | POL, USDC, USDT0 | Runtime endpoint classified as **not Alchemy**. No active chain watches; customer deposit routes disabled. |
| BTC | BTC | Different RPC family; 32 active Manual watches. Not an Alchemy EVM caller in this audit. |
| TRC20 | TRX, USDT | TRON indexer, not Alchemy EVM; monitor asset rows disabled. |
| ARBITRUM / AVAXC / BASE / SPL | Catalog monitor rows exist | Networks disabled; no enabled scheduler RPC workload. |

Network/reference names in Production match the intended Alchemy integrations.
Safe runtime provider classification was verified in Development. Production
secret overrides and account ownership cannot be inferred from reference names;
the new deployed dispatch meter will identify the actual provider class without
exposing endpoints.

## Where RPC requests originate

| Caller | Purpose and requests |
| --- | --- |
| `src/lib/blockchain-monitoring/service.ts` worker | Readiness each due cycle, native/token scans for independent watches, confirmation/reorg checks, bounded recovery |
| Manual watch registration in that service | Fresh chain head for the immutable address watch |
| `src/lib/manual-monitoring-readiness.ts` | Explicit exact-route readiness verification |
| `src/routes/blockchain-monitoring.ts` | Admin connection tests and fresh evidence checks for reviewed matches |
| `src/lib/blockchain-monitoring/evm.ts` | Shared EVM adapter issuing the actual JSON-RPC requests |

Paths above are relative to `artifacts/api-server/`.

The Website, Telegram Bot and Mini App do not run separate customer-side
Alchemy pollers. They use the common backend order/monitoring architecture.
Quickex Convert and XML rate publication use their provider pricing services,
not these EVM chain methods.

## Methods and CU costs

Current official Alchemy EVM method documentation:

| Method | Documented CUs / request | Use |
| --- | ---: | --- |
| `eth_chainId` | 0 | Network identity; still consumes provider throughput |
| `eth_blockNumber` | 10 | Head/readiness/confirmations |
| `eth_getBlockByNumber` | 20 | Probe block, each native scan block, canonical membership |
| `eth_getTransactionReceipt` | 20 | Probe receipt, candidate transfer and finality checks |
| `eth_getLogs` | 60 | Probe token method; each exact token-contract/recipient range |

Source: https://www.alchemy.com/docs/reference/compute-unit-costs

Empty token results still cost a log request. Native watches require block
reads even when no customer transfer exists. Additional probe blocks on empty
blocks, retries, recovery, confirmations and Admin operations add workload.

## Why 30 million CUs is plausible without many customer deposits

A normal full readiness probe costs:

`0 + 10 + 20 + 60 + 20 = 110 CUs`

The old immediate extra head read made the typical worker cycle **120 CUs**
before any address scanning.

At a 15-second interval, one continuously healthy enabled EVM network runs
172,800 cycles in 30 days. Two networks therefore cost:

`2 × 172,800 × 120 = 41,472,000 CUs / 30 days`

That is approximately 1.3824 million CUs/day, or 30 million CUs in **21.7 days**,
from health probes alone. If Development shares the same billed account,
its additional monitors consume the same allowance. Account sharing was not
assumed or proven.

This explains a sufficient source of consumption, not the exact invoiced
30-million-CU attribution. Current quota-rejected operations are not equivalent
to a continuously healthy month's successful requests.

## Implemented optimizations

- Existing EVM polling settings are now honored.
- Active watches, pending confirmations, recent applied reorg checks and
  unresolved eligible registrations remain on the configured operational
  cadence, at least the scheduler's 15-second tick.
- Idle Manual/fallback readiness checks run every **60 seconds** or a slower
  configured interval. This stays inside the existing readiness freshness fence.
- Networks without independent work or Manual/fallback availability use
  **five-minute standby health checks**. The monitor is not disabled.
- New work wakes a connected idle network at its normal cadence. Newly enabled
  Manual/fallback availability wakes standby early enough to preserve readiness.
- Disconnected providers retain failure/quota backoff; new work cannot force
  repeated quota calls.
- WhiteBIT-only orders do not create blockchain watches. Existing Manual
  and frozen WhiteBIT-to-Manual fallback watches continue independently of
  today's catalog provider flags.
- Actual RPC dispatches are counted by provider class, network, method and
  purpose. Local cooldown rejections are not counted as outbound requests.
  Five-minute usage windows are emitted to structured logs.
- Meter overflow is explicit, not silently discarded. No credentials,
  endpoint URLs, customer addresses, transaction hashes or amounts are logged.

The previous RPC request deduplication, bounded narrower-query fallback,
hash-only block payloads and fresh confirmation checks remain intact.

## Monthly forecasts before upgrading

Assumptions: 30 days, uninterrupted healthy providers, existing workload
persists for the whole month, documented method costs above. These are not
invoice totals or guarantees.

### Health-only baseline

| Scenario | Estimated monthly CUs |
| --- | ---: |
| Old Production: ERC20 + BEP20 full probes every 15s plus duplicate heads | 41,472,000 |
| Previous optimized source: two 110-CU probes every 15s | 38,016,000 |
| New source, current Production workload: BEP20 active 15s + ERC20 idle 60s | **23,760,000** |
| New source, current Development Alchemy workload: BEP20 active 15s + ERC20 fallback readiness 60s | **23,760,000** |
| Production + Development health baseline, **only if sharing the billed account** | **47,520,000** |
| Hypothetical all-WhiteBIT deployment with no watches/fallbacks/reorg work, two enabled standby networks | 1,900,800 |

The 1.9-million scenario is **not today's Production configuration** and is
not permission to stop its existing watches.

### Current Production Manual scan scenario

A read-only BSC head-growth probe observed **34 blocks in 15.281 seconds**.
Using four ten-block token ranges per 15-second cycle for each of the two token
watches, plus the existing eight-block native scan cap:

| Component | Modeled monthly CUs |
| --- | ---: |
| New Production health baseline | 23,760,000 |
| BNB: 8 blocks × 20 CUs each per 15-second cycle | 27,648,000 |
| USDC + USDT: 2 watches × 4 ranges × 60 CUs per 15-second cycle | 82,944,000 |
| **Total scenario** | **134,352,000** |

This roughly **134 million CU/month scenario** assumes all three watches
remain active continuously. Head growth varies; actual reads depend on cursors,
deposits, order completion, scan timing and retries. Backlog catch-up permits
up to 16 token ranges per watch/cycle, so temporary usage can be substantially
higher. At that ceiling, the same Production model reaches approximately
383 million CUs/month; it is an upper catch-up scenario, not an expected bill.

Development also has independent legacy watches. Do not budget only the
Production health floor if its RPC applications share the Alchemy allowance.

**Native catch-up risk:** the existing native scan cap is eight blocks per
cycle, below this point-in-time BSC head growth. More provider capacity alone
does not resolve that throughput limit. A separate tested catch-up/indexing
improvement is needed; existing watches were not disabled or skipped to hide it.

## WhiteBIT can replace what, exactly?

For a provider-created WhiteBIT deposit address:

1. Validate the dedicated signed webhook credentials and exact raw payload.
2. Normalize only reviewed asset/network aliases and confirmation evidence.
3. Match the immutable provider address claim, provider asset/network and memo.
4. Require the provider's processed/confirmation evidence.
5. Apply the existing idempotent financial and order-status transitions.
6. Recover missed events through authenticated signed WhiteBIT history.

Those existing paths need no parallel Alchemy proof for provider-owned deposits.
They do **not** prove payment to a separately assigned Manual address. No
financial verification path was weakened or replaced in this change.

## Verification and limitations

**97 relevant tests passed; zero failures or skips** in the targeted final run:

- Consumption policy/meter: 14.
- Actual disposable-DB scheduler integration: 1.
- RPC quota/recovery: 6.
- RPC efficiency/fallback/reorg: 16.
- Blockchain adapters: 15.
- Monitoring service: 21.
- Manual readiness: 13.
- Watch registration: 2.
- Verified funding projections: 9.

The scheduler integration proves reduced idle requests, no parallel watch for
a WhiteBIT-created address, prompt wake-up for Manual/fallback watches, retained
watch activation, and fresh fallback readiness after standby.

API type check and bundle build passed. Development API restart and public
Website smoke screenshot passed. No new live orders, transfers or customer
messages were used for tests. Production data and configuration were unchanged.

An already-running broader browser suite separately finished with **70 passed
and one failure**: a route-family audit observed a 404 resource. This audit did
not change frontend code or rerun that unrelated suite; the 97-test result is
not a claim that the entire project suite is green.

The current selected Alchemy endpoints remain quota-exhausted. Live resumed
monthly consumption cannot be measured until the provider admits requests.
New metering is available in this source but is not in Production until an
approved publication.

## Recommendation

Do not upgrade based solely on the 30-million free allowance. First distinguish:

- WhiteBIT-owned deposits: no independent chain watch required.
- Historical Manual/fallback addresses: retain monitoring until an explicit,
  verified order/address retirement or approved replacement.
- Source rollout: requires Owner publication approval.
- Provider billing: reconcile the Alchemy dashboard's app/method usage with
  the new dispatch windows. No billing-account API credential was available
  for this audit, and no secret was requested.

If retaining the existing three Manual Production watches indefinitely, use
the modeled **134-million-CU scenario plus observed recovery/confirmation
overhead**, not the 23.76-million health-only floor, for initial planning.
Recalculate after sustained healthy windows and review the native catch-up
limitation before treating a paid plan as a complete monitoring fix.
