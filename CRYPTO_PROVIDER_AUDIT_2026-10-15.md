# QuickXchange crypto provider and monitoring audit

Date: 2026-10-15 UTC. Production was inspected read-only. Public WhiteBIT catalog classification: 2026-10-15T03:49:01.501Z.

## Scope and result

- **35 assets, 49 asset/network routes** inventoried, including disabled catalog imports.
- **26 Manual-provider routes**, of which **16 have asset/network enabled**.
- **Five enabled Manual routes have Customer Deposits ON:** ETH/ERC20, USDC/ERC20, USDT/ERC20, TRX/TRC20 and the catalog asset SPL/SOL.
- Manual public-catalog classification: **17 automatic identity candidates**, **4 requiring explicit network selection**, **5 without an exact currently advertised identity**. These are classifications, not live address permission or financial activation.
- No protected Production mutation, customer order, payout, credential change or publication was performed by this agent.
- Production Owner endpoints require an authenticated Owner session; unauthenticated access was verified as HTTP 401 in the immediately preceding investigation. No impersonation or direct SQL activation was used.

## Current Production WhiteBIT routes

Final read-only verification confirms BNB/BEP20, USDT/BEP20, USDC/BEP20, USDT/TRC20 and XMR/XMR are saved as WhiteBIT with Customer Deposits ON and credential-matching stored proofs. This does not replace the server's exact configuration-digest checks or constitute a newly executed address-permission request by this agent.

BEP20 retains three historical Manual watches. USDT/BEP20 has fallback ON but Manual tracking OFF. USDT/TRC20 has fallback and tracking ON; its independent RPC requirements must not be mistaken for WhiteBIT deposit monitoring.

## Owner authorization actions

### 1. Verify and activate additional supported exact routes

Priority currently deposit-enabled Manual routes: **ETH/ERC20, USDC/ERC20, USDT/ERC20, TRX/TRC20**. Do not map SPL to SOL by assumption.

Other enabled Manual routes with exact public-catalog candidates: BTC/BTC, LTC/LTC, USDC/POLYGON, USDT/POLYGON, USDT/TON, XLM/XLM, XRP/XRPL.

In each existing network editor:
1. Select WhiteBIT and the exact candidate asset/network below.
2. Save through the existing provider-switch controls; Customer Deposits remains OFF during verification.
3. Use **Verify WhiteBIT**. The existing flow tests the selected signed credentials, requests a real verification address only after confirmation, and saves proof for that exact route/configuration.
4. Enable **Turn Customer Deposits ON** only when the server accepts current credentials, capability, mapping and permission proof.
5. Opt out of Manual fallback if WhiteBIT-only new deposits are intended. Preserve the wallet, memo/tag, monitor identity and RPC settings.

The workspace signed credential check succeeded in the preceding investigation and matched Production's saved credential identity. Fresh Production account-specific address-creation checks require the Owner controls. Existing proofs must not be copied across row IDs.

### 2. Review ambiguous/unsupported identities without guessing

Enabled routes requiring explicit provider-network choice: USDC/SPL → SOL; USDT/SPL → SOL.

Disabled AVAX/AVAXC and USDT/AVAXC advertise CCHAIN as a plausible candidate but remain disabled; review chain identity before selecting it. Disabled routes/imported API catalog rows were not enabled as a side effect of this audit.

Enabled exact identities currently unsupported: DOT/DOT, SPL/SOL, TON/TON. Keep Manual/RPC. The catalog stores Solana's asset symbol as SPL, not SOL; an Owner must establish the intended asset identity before any WhiteBIT override or catalog rename. Other unmatched/disabled routes are listed below.

### 3. Repair actual saved monitor configuration and capacity

| Production monitor | Confirmed state/cause | Owner action |
|---|---|---|
| BEP20 | Three active watches; last successful scan October 10; current V2 resource rejects with HTTP/RPC 429 quota exhausted | Restore adequate full RPC capacity through the existing monitoring settings/secret references, then run the connection test and verify bounded catch-up. Do not retire watches merely because new deposits use WhiteBIT. |
| ERC20 | Disconnected; last successful scan October 10; provider explicitly reports quota exhausted | Restore RPC capacity, or verify WhiteBIT routes before changing new deposit providers. Legacy obligations still require independently verified monitoring. |
| BTC | Saved as EVM with no endpoint or chain ID; configured Bitcoin resource failed its provider probe | Select the Bitcoin adapter and a valid Bitcoin endpoint/identity, then verify. The existing resource failure does not establish that a paid upgrade alone fixes it. |
| POLYGON | No saved endpoint or chain ID | Bind POLYGON_MONITOR_RPC_URL and exact chain 0x89 via Owner controls and test. The workspace resource passed a live chain/head probe. |
| TRC20 | No saved endpoint reference; stale October 7 scan/error remains | Bind TRON_MONITOR_API_URL and test exact TRON mainnet identity. The workspace resource passed (0x2b6653dc). This is a configuration binding issue, not evidence that the resource is unavailable. |

Workspace probes do not prove Production-specific endpoint overrides are identical. Test in the target environment before enabling Manual customer deposits. The secondary BSC resource answered initial RPCs but rejected the log capability probe with RPC -32005/range limited; it cannot be advertised as a verified replacement. Do not bypass TLS or accept partial RPC readiness.

### 4. Reconcile historical obligations before watch retirement

Read-only Production records include nine BEP20 Manual orders (four awaiting funds, five funds confirmed), plus older Manual/fallback records on BNB, TRC20 and Monero. Absence of active watches or registration-gap rows is not proof these obligations are clear.

The prior live BSC investigation found successful canonical referenced transactions but recipient/amount mismatches against current frozen watches for five applied observations. Do not erase those records, bulk-cancel them as unfunded, or mark Done without independently confirmed payout. Verify complete assigned-address histories, frozen funding identities and financial obligations before an audited terminal action or watch retirement. Fiat records were excluded from crypto migration targets.

### 5. Publish tested source only when authorized

No publication occurred. The new scheduling, error handling and Admin labels do not change live Production merely because they are tested in the workspace.

## Application defects fixed and verified

- Receiving-wallet previews/saves no longer initiate Manual RPC readiness for WhiteBIT-only rows just because a saved wallet/tracking flag exists. Explicit monitoring tests remain available.
- Safe workload-based pause/resume now applies to **EVM, TRON, Bitcoin and Solana**, not just EVM.
- Pausing is prevented by active watches, unresolved evidence, eligible unregistered Manual obligations, Manual selection or effective tracked fallback. Catalog changes cannot redirect frozen order funding.
- Disabled/deprecated catalog routes do not create unnecessary readiness work; historical obligations are checked independently.
- An opted-in fallback with tracking OFF no longer causes idle RPC readiness polling.
- Manual selection resumes network readiness without silently enabling tracking or Customer Deposits. Explicit readiness remains mandatory before accepting customer deposits.
- A missing endpoint/unsupported adapter-finality configuration is recorded as not_configured with a bounded retry, instead of leaving an obsolete disconnected error and repeatedly leasing every tick. Configuration is rechecked under the current lease/lock; no successful scan or healthy proof is fabricated.
- Verified connection heads are reused only within the same cycle, removing duplicate TRON/Bitcoin/Solana head reads. Confirmation/receipt/reorg checks remain independent.
- Admin labels explicitly distinguish **WhiteBIT deposit permission/readiness** from **Manual/RPC readiness**. BLOCKED Manual/fallback status does not masquerade as WhiteBIT permission failure.

## Verification

**137 targeted tests passed:** policy/meter 15, real disposable-database scheduler 1, monitoring service 21, Manual readiness 13, provider recovery 6, adapters 15, WhiteBIT Swap integration 55, Admin route-state 11. The updated scheduler/service cases were rerun after the final error-handling fix.

API and Website type checks and production builds passed. Tests used isolated fixtures/mock providers; no real order, payout or customer message was created. The scheduler integration checks EVM and TRON pause/resume, preserved configuration, legacy obligations, quota backoff, duplicate head removal, missing configuration backoff and recovery.

One outdated integration expectation was corrected: remembered fallback ON with tracking OFF is not active readiness work. It now verifies no polling until fallback tracking is actually enabled.

Remaining Production activation/capacity/configuration actions are not represented as passing live tests. No exact Alchemy account bill or remaining quota is available through the provided access; RPC dispatch metrics and modeled costs are not billing totals.

The observed Production usage window from 03:56:16 to 04:02:11 UTC recorded
two actual monitoring dispatches: one ERC20 eth_chainId and one BEP20
eth_chainId. Both networks were quota-blocked. This is not successful monitoring
or proof of healthy cost reduction.

The pre-existing broad browser workflow remains failed on two unrelated checks:
a Convert logo URL expectation and an unclassified 404 during the responsive
route audit (69 other cases passed). That older run was not launched or rerun
for this scoped change. The targeted passes above are not a full-project PASS.

## Complete asset/network inventory

"Enabled" means both asset and network enabled. "Proof" means credential-matching saved record only. "automatic" means existing architecture found a public identity candidate; it never means credentials, address permission or activation were automatically granted.

| Asset | Network | Route ID | Enabled | Execution | Provider | Customer deposits | Manual fallback | Public identity status | Candidate mapping | Saved proof | Active watches |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0G | 0G | whitebit-0g-0g | No | api | whitebit | OFF | OFF | automatic | 0G/0G | Absent | 0 |
| 1INCH | ERC20 | whitebit-1inch-erc20 | No | api | whitebit | OFF | OFF | automatic | 1INCH/ERC20 | Absent | 0 |
| 2Z | SOL | whitebit-2z-sol | No | api | whitebit | OFF | OFF | automatic | 2Z/SOL | Absent | 0 |
| AAVE | ERC20 | whitebit-aave-erc20 | No | api | whitebit | OFF | OFF | automatic | AAVE/ERC20 | Absent | 0 |
| ACE | BEP20 | whitebit-ace-bep20 | No | api | whitebit | OFF | OFF | automatic | ACE/BEP20 | Absent | 0 |
| ACN | ERC20 | whitebit-acn-erc20 | No | api | whitebit | OFF | OFF | automatic | ACN/ERC20 | Absent | 0 |
| ACT | SOL | whitebit-act-sol | No | api | whitebit | OFF | OFF | automatic | ACT/SOL | Absent | 0 |
| ADA | ADA | ada-cardano | No | manual | whitebit | OFF | OFF | automatic | ADA/ADA | Absent | 0 |
| ADX | ERC20 | whitebit-adx-erc20 | No | api | whitebit | OFF | OFF | automatic | ADX/ERC20 | Absent | 0 |
| AEVO | ERC20 | whitebit-aevo-erc20 | No | api | whitebit | OFF | OFF | automatic | AEVO/ERC20 | Absent | 0 |
| AGLD | ERC20 | whitebit-agld-erc20 | No | api | whitebit | OFF | OFF | automatic | AGLD/ERC20 | Absent | 0 |
| AGRS | ERC20 | whitebit-agrs-erc20 | No | api | whitebit | OFF | OFF | automatic | AGRS/ERC20 | Absent | 0 |
| AI | BEP20 | whitebit-ai-bep20 | No | api | whitebit | OFF | OFF | automatic | AI/BEP20 | Absent | 0 |
| AIXBT | BASE | whitebit-aixbt-base | No | api | whitebit | OFF | OFF | automatic | AIXBT/BASE | Absent | 0 |
| ALGO | ALGORAND | whitebit-algo-algorand | No | api | whitebit | OFF | OFF | automatic | ALGO/ALGORAND | Absent | 0 |
| ALICE | ERC20 | whitebit-alice-erc20 | No | api | whitebit | OFF | OFF | automatic | ALICE/ERC20 | Absent | 0 |
| ARB | ARBITRUM | whitebit-arb-arbitrum | No | api | manual | ON | OFF | automatic | ARB/ARBITRUM | Absent | 0 |
| AVAX | AVAXC | avax-c-chain | No | manual | manual | OFF | OFF | owner_selection | Owner choice: CCHAIN | Absent | 0 |
| BCH | BCH | bch-bitcoin-cash | No | manual | manual | OFF | OFF | automatic | BCH/BCH | Absent | 0 |
| BNB | BEP20 | bnb-bep20 | Yes | manual | whitebit | ON | OFF | protected | — | Present | 1 |
| BNB | BNB | bnb-bnb | No | manual | whitebit | OFF | OFF | unsupported | — | Absent | 0 |
| BTC | BTC | btc-bitcoin | Yes | manual | manual | OFF | OFF | automatic | BTC/BTC | Absent | 0 |
| DAI | ERC20 | dai-erc20 | No | manual | manual | OFF | OFF | unsupported | — | Absent | 0 |
| DOGE | DOGE | doge-dogecoin | No | manual | manual | OFF | OFF | automatic | DOGE/DOGE | Absent | 0 |
| DOT | DOT | dot-polkadot | Yes | manual | manual | OFF | OFF | unsupported | — | Absent | 0 |
| ETH | ERC20 | eth-ethereum | Yes | manual | manual | ON | OFF | automatic | ETH/ERC20 | Absent | 0 |
| LTC | LTC | ltc-litecoin | Yes | manual | manual | OFF | OFF | automatic | LTC/LTC | Absent | 0 |
| POL | POLYGON | pol-polygon | Yes | manual | none | OFF | OFF | automatic | POL/POLYGON | Absent | 0 |
| SPL | SOL | sol-solana | Yes | manual | manual | ON | OFF | unsupported | — | Absent | 0 |
| TON | TON | ton-ton | Yes | manual | manual | OFF | OFF | unsupported | — | Absent | 0 |
| TRX | TRC20 | trx-tron | Yes | manual | manual | ON | OFF | automatic | TRX/TRC20 | Absent | 0 |
| USDC | ARBITRUM | usdc-arbitrum | No | manual | manual | OFF | OFF | automatic | USDC/ARBITRUM | Absent | 0 |
| USDC | BASE | usdc-base | No | manual | manual | OFF | OFF | automatic | USDC/BASE | Absent | 0 |
| USDC | BEP20 | usdc-bep20 | Yes | manual | whitebit | ON | OFF | protected | — | Present | 1 |
| USDC | ERC20 | usdc-erc20 | Yes | manual | manual | ON | OFF | automatic | USDC/ERC20 | Absent | 0 |
| USDC | POLYGON | usdc-polygon | Yes | manual | manual | OFF | OFF | automatic | USDC/POLYGON | Absent | 0 |
| USDC | SPL | usdc-solana | Yes | manual | manual | OFF | OFF | owner_selection | Owner choice: SOL | Absent | 0 |
| USDT | ARBITRUM | usdt-arbitrum | No | manual | manual | OFF | OFF | automatic | USDT/ARBITRUM | Absent | 0 |
| USDT | AVAXC | usdt-avalanche-c | No | manual | manual | OFF | OFF | owner_selection | Owner choice: CCHAIN | Absent | 0 |
| USDT | BASE | usdt-base | No | manual | manual | OFF | OFF | unsupported | — | Absent | 0 |
| USDT | BEP20 | usdt-bep20 | Yes | manual | whitebit | ON | ON | protected | — | Present | 1 |
| USDT | ERC20 | usdt-erc20 | Yes | manual | manual | ON | OFF | automatic | USDT/ERC20 | Absent | 0 |
| USDT | POLYGON | usdt-polygon | Yes | manual | manual | OFF | OFF | automatic | USDT/POLYGON | Absent | 0 |
| USDT | SPL | usdt-solana | Yes | manual | manual | OFF | OFF | owner_selection | Owner choice: SOL | Absent | 0 |
| USDT | TON | usdt-ton | Yes | manual | manual | OFF | OFF | automatic | USDT/TON | Absent | 0 |
| USDT | TRC20 | usdt-trc20 | Yes | manual | whitebit | ON | ON | protected | — | Present | 0 |
| XLM | XLM | xlm-stellar | Yes | manual | manual | OFF | OFF | automatic | XLM/STELLAR | Absent | 0 |
| XMR | XMR | xmr-monero | Yes | manual | whitebit | ON | ON | protected | — | Present | 0 |
| XRP | XRPL | xrp-xrpl | Yes | manual | manual | OFF | OFF | automatic | XRP/XRP | Absent | 0 |
