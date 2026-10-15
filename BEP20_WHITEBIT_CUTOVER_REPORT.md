# BEP20 WhiteBIT cutover: verification and safety result

Date: 2026-10-15 UTC.

## Result

**NOT COMPLETED IN PRODUCTION. Legacy Manual monitoring must remain enabled.**

Production was inspected read-only. No provider configuration, order, financial
record, address, proof or watch was modified. No real order, payment, withdrawal
or customer message was created for testing.

The requested condition—no pending deposits, active orders or outstanding
obligations on the old Manual addresses—is not met.

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

## Tests completed

WhiteBIT tests:

- Unit: **23 passed**
- History worker: **19 passed**
- General integration: **20 passed**
- Swap integration, including the expanded BEP20 cases: **55 passed**

RPC policy/meter and real scheduler tests:

- Unit: **14 passed**
- Disposable-database scheduler integration: **1 passed**

**Total: 132 passed, zero remaining targeted failures.**

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

A fixture collision with an earlier USDC catalog test was corrected by making
the new USDC fixture local to its scenario. The affected Swap suite was rerun.
The test runner confirms Development routes, credentials and provider settings
remain unchanged. Type check and diff checks passed.

Only test fixtures/regressions and this report were changed. No financial
application code or live configuration was changed, and nothing was published.

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

After safe retirement of all BEP20 obligations and no other BEP20 work:

- Leaving an enabled standby monitor costs approximately **0.9504 million CUs
  per 30 days** under the optimized five-minute readiness cadence.
- Disabling that genuinely unused monitor eliminates its routine BEP20 RPC
  polling. Explicit Admin tests can still make requests.
- Unchanged idle ERC20 Manual readiness would still cost approximately
  **4.752 million CUs / 30 days** under the optimized source, before any new
  ERC20 watches, confirmations, recovery or Admin calls.

Production account usage must be reconciled with Alchemy's own metrics. Do not
budget for zero Alchemy usage while the legacy Manual obligations remain.
