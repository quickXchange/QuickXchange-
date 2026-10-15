# BEP20 WhiteBIT cutover: verification and safety result

Date: 2026-10-15 UTC. Saved Production route settings last checked at
02:31:34 UTC.

## Result

**OWNER ACTION REQUIRED IN PRODUCTION. Legacy Manual monitoring is preserved.**

Automatic RPC pause/resume is now implemented and tested in the workspace.
It has not been published by this agent. The live provider switch and test-order
closure have not been performed.

Production was inspected read-only. No provider configuration, order, financial
record, address, proof or watch was modified. No real order, payment, withdrawal
or customer message was created for testing.

The requested condition—no pending deposits, active orders or outstanding
obligations on the old Manual addresses—is not met.

The Owner identifies these nine orders as tests. That authorizes investigation,
not ignoring contradictory historical payment records or deleting evidence.

## Current Production records

| Asset / route | Provider for new deposits | Manual orders awaiting funds | Manual orders funds confirmed / processing | Active Manual watches |
| --- | --- | ---: | ---: | ---: |
| BNB / `bnb-bep20` | Manual | 1 | 1 | 1 |
| USDT / `usdt-bep20` | Manual | 2 | 4 | 1 |
| USDC / `usdc-bep20` | WhiteBIT | 1 | 0 | 1 |
| **Total** | | **4** | **5** | **3** |

One USDT Awaiting Funds order predates the existing watches and has no watch
record. Its saved settlement option is the exact `crypto:usdt-bep20` route.
It cannot be dismissed as harmless merely because it lacks a watch.

There is also one historical WhiteBIT-funded USDT order marked Processing /
Funds Confirmed. Its frozen provider must remain WhiteBIT; it is separate from
the nine unresolved Manual records above.

None of the five Manual Funds Confirmed orders has a recorded payout milestone.
This is not proof that no external payout was ever sent; it means payout
completion is not independently established by the inspected records.

### Live investigation of the five historical matches

All five Funds Confirmed orders have applied blockchain observations. A
read-only BSC RPC check confirmed their referenced transactions exist, succeeded
and belong to canonical confirmed blocks. A second public endpoint allowed
chain/head calls but rejected receipt requests with HTTP 403.

However, each saved observation's recipient and amount differs from its current
frozen watch. Receipt verification against the current watch did not establish
the claimed exact transfer. These mismatches require reconciliation: neither
the applied-match label nor the Owner's test label alone establishes the
correct financial disposition.

This does **not** assert these transactions funded these orders, and it does
**not** certify that the assigned addresses never received funds. No complete
address-history reconciliation was available. Applied observations, order
history and financial states were not edited or removed.

No current confirming, matched, needs-review or recent applied match was found
for these routes. **That does not prove absence of on-chain deposits.**
Production BEP20 monitoring is disconnected; its last successful scan remains
2026-10-10. The old addresses therefore cannot receive a clean retirement
certificate from these records.

## WhiteBIT readiness

Read-only live public capability discovery confirms:

| Asset | WhiteBIT network | Deposit advertised | Current advertised confirmations |
| --- | --- | --- | ---: |
| BNB | BEP20 | Yes | 20 |
| USDT | BEP20 | Yes | 20 |
| USDC | BEP20 | Yes | 20 |

Production WhiteBIT is enabled. USDC/BEP20 has a stored exact-route permission
proof. BNB/BEP20 and USDT/BEP20 do not have stored permission proofs.

Public capability discovery is not account-specific address permission.
Stored proof existence is also not a fresh verification of every configuration
digest and credential fingerprint. The existing Owner verification flow must
check current proofs against the actual Production credential source.

## Safe cutover path through existing Admin controls

The Owner can change **new deposits only** while keeping the legacy watches:

1. Use the existing WhiteBIT integration's selected Production credential source.
   Test signed credentials; do not copy Development proof records into Production.
2. Select the exact three BEP20 route IDs above. Preserve fees, pricing, limits,
   logos, shared historical wallets and all unrelated route configuration.
3. Stage BNB and USDT as WhiteBIT routes with explicit ticker/network mappings:
   BNB/BEP20 and USDT/BEP20. Keep customer deposit availability off until their
   exact-route account permission is verified.
4. Use the existing Owner-only **address-permission verification** operation.
   It requires explicit confirmation because it creates a real provider address.
   It does not create or fund a customer order.
5. Verify USDC's current account and configuration proof too.
6. Enable new customer deposits only after the existing eligibility gate accepts
   the fresh proofs. For WhiteBIT-only future deposits, disable new Manual
   fallback/tracking opt-ins on those catalog rows; do not clear old wallets.
7. Preserve existing orders' source, address, memo, amounts, settlement state,
   funding snapshots and provider claims. Their monitoring ownership is frozen.
8. Check production signed-webhook validation and authenticated history recovery.
   The isolated tests below verify behavior but do not constitute a live funded
   Production test.

Existing protected operations:

- `POST /api/admin/providers/whitebit/credentials/test`
- `GET /api/admin/providers/whitebit/verification-routes`
- `POST /api/admin/providers/whitebit/address-permission/verify`
- Existing Owner receiving-wallet/provider selection and deposit enablement
  controls in Admin

No replacement integration, status system or pricing logic is needed.

### Exact Owner actions for new deposits

In the existing BEP20 network editor for each asset:

1. In **Deposit Provider**, select WhiteBIT. Use the matching asset ticker and
   **BEP20** network.
2. For active BNB/USDT Manual rows, use **Switch to WhiteBIT (turn Customer
   Deposits OFF until verified)**. Do not delete the saved Manual wallet.
3. In **Advanced: Manual fallback**, opt out of fallback if future deposits must
   be WhiteBIT-only. Production USDT currently has fallback opted in.
4. Click **Verify WhiteBIT** and confirm the real verification-address request.
   This uses the selected signed credentials and does not place a customer
   order or send funds.
5. Once the exact-route proof/readiness is accepted, click **Turn Customer
   Deposits ON**. For USDC, inspect the already saved WhiteBIT setup/proof rather
   than blindly overwriting it.
6. Keep the saved Manual addresses/memos, monitor endpoint references, contracts,
   decimals, finality, confirmation and scan settings. Do not disable the network
   or asset monitors to accomplish the switch.

Old orders must be reconciled separately before cancellation/watch retirement.
The five historical match inconsistencies and the older unregistered USDT order
must not be cleared by an unchecked bulk cancellation.

The available Production database tool is read-only; there is no authenticated
Production Owner session available to this agent. It must not bypass those
controls with synthetic authentication or direct database writes.

## Legacy watch retirement gate

Do not disable the BEP20 monitor or its asset monitors now.

Retirement requires:

- Independent reconciliation of all four Awaiting Funds records, including the
  older unregistered USDT order.
- Independent payout/refund evidence and reconciliation for the five Manual
  Funds Confirmed records.
- Current chain coverage for the assigned addresses, resolving the monitoring
  gap rather than treating stale scans as evidence of no payment.
- No remaining eligible registration gaps, unresolved observations, confirming
  matches, ambiguity/review cases or required reorg checks.
- An explicit safe retirement decision for each old address. A catalog provider
  change is not that decision.

Never mark an order complete, cancel it, delete it, backdate a watch or advance
its cursor simply to pass this gate. Existing history and evidence must remain.

## Automatic pause/resume implemented

- Enabled EVM networks with no independent work and no Manual selection/fallback
  make **zero periodic RPC requests**, including idle health checks.
- Selecting Manual resumes readiness even while Customer Deposits is still OFF.
  Fresh proof and explicit deposit enablement remain mandatory.
- WhiteBIT-to-Manual fallback opt-in also resumes readiness.
- Active legacy watches, eligible Manual orders without active watches,
  confirming/matched/needs-review evidence and recent reorg checks prevent pause.
- Provider error/quota backoff is respected.
- Pausing leaves configuration, enabled switches, endpoint references and
  existing health timestamps intact. It does not renew stale proofs.
- Explicit Admin connection/evidence tests remain available.

## Tests completed in this update

WhiteBIT tests:

- Swap integration, including the expanded BEP20 cases: **55 passed**

RPC policy/meter and real scheduler tests:

- Unit: **14 passed**
- Disposable-database scheduler integration: **1 passed**
- Provider recovery: **6 passed**
- EVM efficiency/fallback: **16 passed**
- Monitoring service: **21 passed**
- Manual readiness: **13 passed**
- Watch registration: **2 passed**
- Verified funding projections: **9 passed**

**Total: 137 passed, zero failures or skips in this targeted verification.**

The new cases retain the previous BNB customer-network alias scenario and add
actual BNB/BEP20, USDT/BEP20 and USDC/BEP20 customer routes. Each proves:

- Existing quote/order creation uses the normal pricing path.
- Owner account-permission checks precede deposit availability.
- WhiteBIT address assignment freezes the correct asset and BEP20 identity.
- Accepted events report Payment Detected without confirming settlement early.
- Each BEP20 case tests the currently advertised threshold: 19/20 confirmations
  must not fund the order; 20/20 can fund it.
- Processed confirmed deposits advance the exact order to Processing /
  Funds Confirmed, not Completed.
- Replayed deposits do not duplicate the deposit, funded timestamp or status
  transition, and do not produce a payout milestone.
- Admin detail and token-gated customer tracking agree.
- WhiteBIT orders do not create parallel blockchain watches.
- The existing Manual order's full saved record is unchanged.

The scheduler integration verifies zero idle dispatches, retained configuration,
Manual selection wake-up, WhiteBIT pause on reselection, quota-safe recovery,
legacy/fallback watch preservation and an unregistered Manual obligation
preventing pause. The test runner confirms Development routes, credentials and
provider settings remain unchanged. Type check, API build and diff checks passed.

Only EVM monitoring scheduling/workload selection, corresponding tests and this
report were changed. No pricing, settlement, deposit matching, payout logic or
live configuration was changed. Development API startup passed. Existing
Quickex/provider availability warnings remain; this is not a full-project green
claim. Nothing was published.

## Remaining Alchemy consumption

**No reduction from retiring these addresses can be claimed: they were not
retired.** Switching future deposits to WhiteBIT does not remove their workload.

The previous audit's post-optimization model therefore still applies:

- Production health-only floor: approximately **23.76 million CUs / 30 days**.
- Three Manual BEP20 watches sustained all month: approximately **134 million
  CUs / 30 days**, including modeled native/token scans.

These are explicit workload estimates, not actual account billing totals.
The previous scheduler optimizations are not confirmed published to Production.
Quota-exhausted requests are not a representative healthy monthly workload.

After Owner activation, safe retirement/reconciliation of all BEP20 obligations,
Manual fallback opted out and publication of the tested source:

- The new scheduler makes **zero periodic BEP20 RPC requests** without disabling
  the saved monitor. Explicit Admin tests can still make requests.
- Selecting Manual resumes readiness against the preserved configuration.
- Unchanged idle ERC20 Manual readiness would still cost approximately
  **4.752 million CUs / 30 days** under the optimized source, before any new
  ERC20 watches, confirmations, recovery or Admin calls.

Production account usage/remaining quota must be reconciled with Alchemy's own
metrics; those billing metrics are not exposed through the available access.
No actual Production consumption reduction is claimed from an unapplied
configuration or unpublished source. Do not budget for zero Alchemy usage while
the legacy Manual obligations remain.
