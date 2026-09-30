# Telegram Mini App and Bot audit

## Scope and safety

The audit compares the existing Telegram surfaces with the current website
Swap and Convert widgets. Repairs are confined to presentation, quote callers,
wizard/session handling, tracking capabilities, and tests.

No pricing rules or fees, WhiteBIT provisioning/detection, blockchain monitoring,
Manual wallet routing, provider/deposit enablement, or production order records
were changed. Tests use browser-intercepted responses and mocked providers in
disposable databases. Nothing was published.

## Confirmed problems repaired

| Area | Problem | Repair |
| --- | --- | --- |
| Amount entry | Mini App receive amount was read-only; Bot receive entry did not use the current signed reverse-quote contract. | Use canonical receive-target quotes independently for Swap and Convert. Submit the signed quote's source amount, not an inverted display rate. |
| Quote freshness | Stale asynchronous responses and mode/pair changes could retain unrelated form state. | Match quote responses to route, amount side, input, add-ons and rate mode; reset route-specific details on changes. |
| Policy acceptance | Mini App and Bot could reach creation without explicit acceptance. | Show Terms and AML/KYC links and require acceptance at review. |
| Bot quote options | Bot Convert was fixed to floating mode and Swap did not expose current optional add-on selections. | Offer floating/fixed Convert quotes and current Swap add-on groups; carry the selected values through canonical forward/reverse quotes and creation without changing fee calculations. |
| Settlement fields | Dedicated controls and custom Admin fields could be duplicated, discarded, or overwrite one another. | Preserve all active quote-owned keys; keep Manual settlement values independent of top-level payout controls and serialize required Convert dedicated keys too. |
| Recovery | Uncertain creates could lose their identity; link failure could lead to another create; expired retries could remain locked. | Persist identity-scoped frozen requests, retry unchanged requests, retain successful responses for link-only recovery, and release only authoritative rejections. |
| Bot state | Commands/callbacks could replace unresolved create sessions. | Block session-replacing actions while creation is processing/reconciling, including expired sessions. Read-only order history remains available. |
| Tracking buttons | Index-based Bot order buttons could refer to a different order after list changes. | Encode stable order IDs and verify chat ownership; retain guarded legacy-button handling. |
| Tracking capability | A successful Bot create could store an empty tracking token. | Validate the returned capability and generate the canonical signed replacement when needed. |
| Status presentation | Final reversal/expiry aliases and badge styling were inconsistent; foreground return could show stale status. | Normalize presentation, refresh on polling/focus/reconnect/visibility, invalidate lists after status changes, and retain canonical completion boundaries. |
| Deposit details | No equivalent reusable Mini App modal; recorded details could still solicit another payment. | Order-specific QR/address/memo/network modal with guarded copy feedback. Funded, held and terminal states show recorded details without payment controls and warn against additional deposits. |
| Design | Tapping a card scaled the entire form; inputs could overflow; action bars ignored safe areas; Swap details reused Convert's presentation. | Neutral compact Swap details, separate Convert styling, stable minimum shell height, shrinking inputs, safe-area-aware navigation/actions, and current shared logos/badges. |
| Telegram appearance | Theme applied only when the app opened. | Subscribe to Telegram appearance changes and clean up the subscription. |
| Narrow-screen actions | Long first/review steps could leave the primary action under the bottom navigation. | Keep the action bar outside the animated page container, above navigation, and reserve scroll padding for its full height. |
| Tracking input | Mini App required manual splitting of ID and capability. | Accept current tracking URLs and the legacy token parameter without bypassing capability verification. |

## Status and notification boundaries

- Manual Swap Done requires canonical `completed`, not a deposit hash, WhiteBIT
  credit, confirmation count, customer “paid” report, or funding-stage flag.
- Convert remains Quickex-owned. No Swap monitoring or WhiteBIT logic is used to
  derive its final state.
- Active tracking refreshes on the existing short polling interval and foreground/
  reconnect events. The timeline updates immediately when a fresh response arrives;
  this is not a claim of zero-latency server push.
- Customer lifecycle notifications remain email-only. Telegram Bot interactions,
  order creation, deposit instructions, and explicit tracking remain supported.

## Verification boundary

| Check | Result |
| --- | --- |
| Mini App unit regressions | 57 passed |
| Telegram isolated integration suite | 51 passed |
| WhiteBIT Swap isolated mocked suite | 50 passed |
| Blockchain monitoring service | 21 passed |
| Manual funding projection | 9 passed |
| Quickex focused checks | 11 passed; 2 obsolete cases skipped |
| Website route-state regression checks | 11 passed |
| Website Convert presentation helper | Passed |
| Affected artifact type checks and builds | Passed; non-blocking build warnings remain |
| Distinct mocked browser scenarios | Eight verified; fixed-receive Convert remains a blocker |
| Swap steps 1/2/3 responsive matrix | 24 combinations passed: four widths, two themes, three steps, with primary-action/navigation bounds checked |
| Tracking responsive matrix | WhiteBIT, Blockchain and Quickex exercised at 320/360/390/430 in both themes |

### Remaining automated blocker

The fixed-rate receive-target Convert browser scenario still fails to emit its
intercepted reverse-quote request under Playwright's frozen clock. It passed a
targeted run earlier but failed subsequent matrix runs. Advancing the 450ms
debounce and waiting for settled route initialization did not reliably resolve
the failure. Repeated attempts were stopped; the root cause is not established.

Do not treat Convert's complete three-step responsive matrix, or this fixed-rate
receive-target browser journey, as verified. The reverse-quote API and caller are
implemented and have focused contract coverage, but that does not replace the
missing integrated proof.

Screenshots from the passing Swap matrix are available in
`test-results/telegram-mini-app-exchange-07814-ns-the-exact-quoted-amounts/`.

## Still requires an authenticated Telegram device check

1. Open the Mini App through the actual Bot menu/link on Telegram Android and iOS
   and confirm SDK initialization and authentication with genuine `initData`.
2. Check native keyboard/safe areas, Telegram theme changes, Back Button behavior,
   clipboard permission, and camera-wallet QR scanning.
3. Verify live Bot webhook command delivery, edited inline messages, stale-button
   responses, Mini App launch links, and returning from external policy/account links.
4. Observe an already-existing authorized order through its real lifecycle to
   validate live update timing and provider availability. This audit did not send
   crypto or create provider transactions to perform that check.

These native checks do not justify changing funding architecture or publishing
without a separate instruction.