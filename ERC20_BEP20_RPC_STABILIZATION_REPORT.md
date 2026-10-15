# ERC20 / BEP20 RPC stabilization

Verified on 2026-10-15 UTC. Scope: application-side RPC efficiency, bounded
query fallback, deposit-monitoring safety, and read-only provider diagnostics.

## Result

**Application changes and targeted regressions: PASS.**

**Live ERC20/BEP20 monitoring on the configured endpoints: BLOCKED by exhausted
Alchemy monthly capacity.** The application cannot restore an exhausted
provider account's capacity. No Production configuration was changed and
these source changes have not been published.

## Implemented changes

1. Readiness checks verify chain identity before making additional RPC calls.
   An identity or quota failure now stops at the first request instead of
   starting both identity and head requests concurrently.
2. The EVM worker reuses the fresh head returned by its readiness check within
   that cycle, eliminating its immediate duplicate head request. Other network
   adapters retain their existing behavior.
3. Token scans can combine exact recipient filters for the same contract,
   in chunks of at most 50 recipients. The current worker still owns each
   watch and cursor independently; this does not replace its watch processing
   or introduce a second matching/status system.
4. Providers rejecting combined filters fall back to narrower recipient
   filters. Providers rejecting ranges fall back to smaller, non-overlapping
   ranges. A scan has a shared 64-request budget and the existing RPC/cycle
   deadlines still apply.
5. Quota, rate-limit, authentication, network and timeout failures do not
   trigger query-splitting retries. Failed or partially successful queries
   never become a successful empty scan.
6. Receipts and canonical blocks are deduplicated inside a single token scan.
   These reads are not cached across confirmation checks or monitoring cycles.
7. Token verification and confirmation reads request hash-only block
   transaction lists instead of full transaction objects. Receipt success,
   exact token events, canonical block hashes and transaction membership are
   still checked. Native scans still request full transactions when needed.
8. Removed logs and logs outside the requested block range are excluded.
9. Textual throughput errors are classified as rate limits rather than range
   restrictions. Existing bounded endpoint cooldown and recovery remain intact.

The exact contract, recipient, raw amount, decimal precision, finality,
lease, registration and idempotency safeguards remain in place. These changes
do not mark orders complete, initiate payouts or change settlement/pricing.

## Measured improvements

| Check | Previous request pattern | Verified new pattern |
| --- | --- | --- |
| One-watch token scan, two events in one transaction/block | 5 reads | 3 reads: 40% fewer |
| Adapter scan with two exact recipients in one transaction/block | 6 reads | 3 reads: 50% fewer |
| EVM cycle's immediate readiness/head reads | Fresh head followed by another head read | Fresh readiness head reused once |
| Readiness identity/quota failure | Two concurrent initial calls possible | One initial call |

The call-count comparisons are controlled regression fixtures, not a claim
that every live monitoring cycle is 40–50% cheaper.

A read-only Ethereum PublicNode probe requested the same real block both ways:

- Full transaction objects: **423,291 bytes**, 205 ms.
- Transaction hashes: **20,484 bytes**, 86 ms.
- **95% fewer response bytes**, with identical canonical block hash and
  transaction count.

This is a point-in-time payload measurement on a free candidate, not a paid
provider latency guarantee.

## Real provider diagnostics

| Endpoint/reference | Evidence | Readiness conclusion |
| --- | --- | --- |
| `ETHEREUM_MONITOR_RPC_URL` — Alchemy | `eth_chainId`: HTTP 429 / RPC 429, monthly capacity exhausted, 205 ms | Blocked before further requests |
| `BSC_MONITOR_RPC_URL_V2` — Alchemy | `eth_chainId`: HTTP 429 / RPC 429, monthly capacity exhausted, 137 ms | Blocked before further requests |
| Existing `BSC_MONITOR_RPC_URL` alternative | Chain/head/block/receipt calls succeeded; exact-recipient one-block USDT logs returned RPC -32005 | Not a complete token-monitoring fallback |
| Ethereum PublicNode | Correct chain, head, one-block and ten-block USDT log filters, historical block and canonical receipt succeeded | Passed this required-method probe; not activated |
| BSC PublicNode | Correct chain, head, logs and block succeeded; receipt calls returned HTTP 403 / RPC -32602 on four valid hashes across two blocks | Not a complete fallback from this host |

No endpoint URLs containing credentials, API keys, customer addresses or
transaction identifiers are included in this report. No public candidate was
silently substituted for an Admin-selected provider.

Development configuration was read-only inspected:

- ERC20 and BEP20 poll interval: **15 seconds**.
- Both maximum scan offsets: **9**, covering ten inclusive blocks.
- Both remained disconnected during quota exhaustion.

The existing BSC scan bound is already compatible with the documented
ten-block free-tier limitation. Increasing the range is not the required fix.
Development probes do not prove that Production resolves identical secret
values; Production must be verified after any approved rollout/provider action.

## Verification

**82 unique relevant tests passed; zero failures or skips:**

| Suite | Passed |
| --- | ---: |
| New RPC efficiency, fallback and reorg regressions | 16 |
| Provider quota/cooldown/recovery | 6 |
| Existing blockchain adapters | 15 |
| Monitoring service / catch-up / idempotency | 21 |
| Manual monitoring readiness | 13 |
| Automatic watch registration | 2 |
| Verified funding / order-detail projection | 9 |

Database-dependent checks used disposable test databases. No live customer
orders, deposits, payouts or messages were created for testing.

- API type check: PASS.
- API production bundle build: PASS.
- Diff whitespace validation: PASS.
- Development API restart: PASS; server listening.
- Public Website smoke screenshot: renders the existing exchange and layout.
  Existing provider-unavailable responses and development authentication
  warnings were not hidden.

Live ERC20/BEP20 deposit detection cannot be certified while the selected RPC
accounts reject their first required method. Isolated tests prove the changed
safety/recovery behavior; they are not a substitute for live recovery verification.

## Exactly what needs payment or approval

### Capacity purchase, if retaining the configured providers

Restore/increase the **Alchemy monthly compute-unit allowance** covering the
Ethereum and BSC applications behind the two configured references, or wait
for the account's quota reset. This is a provider-account action; replacing
application code or bypassing TLS will not fix it.

Alchemy documents a Free allowance of 30 million compute units and a paid
Pay-As-You-Go option. Check the account's actual usage/billing controls before
purchasing: two endpoint references do not necessarily mean two separately
billed accounts. An Enterprise upgrade is not established as necessary.

The evidence establishes monthly exhaustion, not a required new API key,
larger log ranges or a specific monetary budget. Exact monthly spend cannot
be calculated without the provider's account usage and app-level CU metrics.

Sources:

- https://www.alchemy.com/docs/reference/pricing-plans
- https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint
- https://publicnode.com/

### No-payment alternative requiring explicit provider selection approval

Ethereum PublicNode passed this probe and can be evaluated as a free
replacement. Switching financial monitoring to a public provider requires
explicit configuration approval and full exact-route/historical-read validation.
Its free service is not a reliability guarantee.

No fully working BSC free fallback was established among the tested candidates.
The existing alternate and PublicNode must not be enabled as if they passed
the complete required method set.

### Rollout and recovery verification

Publication remains an Owner decision. After restored capacity or an approved
provider selection and rollout, verify fresh readiness, exact-route proofs,
cursor catch-up, canonical receipt/finality and automatic order projections.
Do not backdate a new watch or replay uncertain financial writes.
