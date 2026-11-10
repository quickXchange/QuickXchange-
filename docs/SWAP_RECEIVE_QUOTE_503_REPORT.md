# Swap receive-side HTTP 503 — investigation and Development fix

Date: 2026-11-10. Changes are Development-only. Nothing was published.

## Confirmed findings

The affected directed route is USDT/TRC20 → EUR/SEPA Instant. Both Website and Telegram Mini App call the same backend reverse quote endpoint, `POST /api/exchange/quote-by-receive`. This is Manual Swap pricing, not Quickex Convert.

The request resolves the configured settlement options, matches the existing pricing rule, captures the existing reference-rate basis, then uses the canonical forward quote builder as a bounded numeric oracle. Each successful result carries its original signed quote ticket. Existing fees, tier selection, provider selection and target rounding remain authoritative.

The defect is in bracket refinement, not a missing payment-method route. Forward fiat amounts are rounded. When the upper bracket exactly matches the desired receive amount, the solver subtracts a receive quantum to refine the source amount. That candidate can fall only one floating-point step above the lower bracket. This branch previously lacked a sufficient-progress safeguard. Repeated negligible steps consume all 44 permitted probes without convergence.

An isolated reproduction with a synthetic reference rate of 0.8499279386 and a two-decimal forward oracle exhausted 44 probes for a target of 2078. The final probes advanced the source by approximately 4.55e-13 while continuing to return 2077.99. This number is a regression fixture, not a configured or advertised rate.

Before the fix, the real Development API returned:

- Forward input 1117.192 USDT: HTTP 200 in 0.518 seconds.
- Receive input 2078 EUR: HTTP 503 in 0.131 seconds, `MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED`.

This fast failure independently reproduces attempt exhaustion without requiring a provider timeout or database outage.

## Read-only Production evidence

The Production investigation found four logged receive-quote budget rejections between 18:37:15Z and 18:37:50Z, corresponding to 19:37–19:37:50 in Algiers.

At 21:48Z, safe public quote-only requests confirmed:

- The exact directed route exists and is available.
- Forward quote: HTTP 200 in 903 ms.
- Receive target 2078 EUR: HTTP 503 in 2861 ms.
- Matching log at `2026-11-10T21:48:39.175Z`: `/api/exchange/quote-by-receive`, `MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED`, response status 503.

The Production rejection took less than the endpoint's 12-second deadline and is consistent with the deterministic attempt-limit defect. The incident build did not log which budget was exhausted, so the exact historical internal branch cannot be proven from its logs alone. Development now records that distinction.

PostgreSQL pool contention was also observed: at 18:38:07Z, 10 total connections, zero idle, six waiting, last acquisition 3500 ms. Similar warnings predated the incident. This is a separate confirmed reliability concern, not proof of the quote error's cause. No 1Forge/Coinbase failure was logged at the incident minute; absence of a log is not a universal guarantee of provider health. No provider change is needed to reproduce or fix the solver defect.

No Production database records, live configuration, credentials, services or DNS were changed. No order endpoint was called.

## Fix

1. Safeguard refinement candidates near either bracket endpoint with a midpoint step. Continue to evaluate every candidate using canonical forward pricing.
2. Preserve the 44-probe endpoint cap and 12-second end-to-end deadline. No unbounded retries or fallback provider were added.
3. Record sanitized failure stage, budget reason, attempt count when available, and elapsed time. Do not log payment details or signed quote tokens.
4. Clear the Mini App's inactive calculated amount whenever a Swap quote is missing, mismatched or expired. Keep the customer's active input. Existing quote identity, cancellation, expiry and Continue gates remain authoritative.
5. Use the existing shared translation system for actionable quote-failure messages in English, French, German, Russian, Spanish, Korean and Ukrainian. Do not expose raw HTTP/solver diagnostics.
6. Check Website quote expiry on restore/visibility changes even on the initial amount-entry step.

## Exact changed files

Backend:

- `artifacts/api-server/src/lib/manual-receive-quote.ts`
- `artifacts/api-server/src/routes/exchange.ts`

Customer UI:

- `artifacts/crypto-exchange-widget/src/components/exchange-surface.tsx`
- `artifacts/quickxchange-telegram-mini-app/src/pages/exchange.tsx`

Shared translations:

- `lib/i18n/src/quote-errors.ts`
- `lib/i18n/src/index.ts`
- `lib/i18n/src/locales/en.ts`
- `lib/i18n/src/locales/fr.ts`
- `lib/i18n/src/locales/de.ts`
- `lib/i18n/src/locales/ru.ts`
- `lib/i18n/src/locales/es.ts`
- `lib/i18n/src/locales/ko.ts`
- `lib/i18n/src/locales/uk.ts`

Tests:

- `artifacts/api-server/test/manual-receive-quote.test.ts`
- `lib/i18n/tests/quote-errors.test.ts`
- `e2e/live-quote.spec.ts`
- `e2e/telegram-mini-app-exchange.spec.ts`

Documentation:

- This report.
- `.agents/memory/manual-receive-target-quoting.md` — durable numerical-search lesson.

An unrelated pre-existing generated mockup-components change was left untouched.

## Verification

### Real Development API after the fix

These are measured observations of fresh quote-only requests, not guaranteed future prices or response times:

| Input | HTTP | Time | Solver probes |
|---|---:|---:|---:|
| Send 1117.192 USDT | 200 | 474 ms | N/A |
| Receive 2078 EUR | 200 | 403 ms | 32 |
| Receive 1000 EUR | 200 | 55 ms | 18 |
| Receive 2079 EUR | 200 | 92 ms | 32 |

The backend returned the canonical source amount and signed ticket. No screenshot amount was treated as executable pricing.

### Automated checks

- Receive-solver regressions: 16 PASS, including the exact 2078 plateau, multiple rounded targets, tier discontinuities, fixed/add-on fees, caps, deadlines, attempt budgets, provider-failure propagation and signed-ticket integrity.
- Prepared route/reference context regression: 1 PASS.
- Shared language tests: 23 PASS.
- Website quote transport/identity tests: 6 PASS.
- Mini App quote transport and route identity tests: 17 PASS.
- Website browser regressions: 4 PASS, desktop and mobile receive-failure recovery plus the existing forward-quote/cleared-input/failure flow.
- Mini App browser regressions: 3 PASS, covering Russian failure/recovery, stalled transport and superseded responses.
- Mini App with real Development public catalog/pricing/quote endpoints: 1 PASS. Only Telegram authentication bootstrap was simulated; no real order was submitted.
- Shared-library, API, Website and Mini App TypeScript checks: PASS.
- API build and both frontend production builds: PASS. Existing non-blocking CSS, sourcemap and chunk-size warnings remain.
- Mobile preview screenshot: app rendered successfully. Browser checks covered readable Light/Dark failure states and no horizontal overflow.

The Website browser fixture initially failed because its first-load migration reset the test's chosen language to English. The fixture now explicitly completes that migration and supplies contract-shaped add-on and route-pricing responses. No application language behavior was changed to accommodate the test.

An already-running broad `api-tests` workflow separately ended with 74 passing and seven failing browser cases. One was the old generic quote-error text expectation; that expectation was updated for the requested new customer-safe copy, and its affected test subsequently passed on desktop and mobile. The other six broad-suite failures were not rerun or certified by this focused fix: landing artwork, default-pair restoration, Convert wallet flow, Convert email/footer geometry, Admin mobile tables and Admin Revenue header expectations. This report does not claim the entire project regression suite is green.

Browser verification used Chromium and a simulated Telegram authentication context, not a physical Telegram WebView or iOS Safari device. Real Development backend quote calculations were verified separately from UI fixtures.

## Release status and remaining actions

Development: the reproduced defect is fixed and focused verification passed.

Production: still affected at the last read-only reproduction; the tested fix is not published. Publishing requires the Owner's approval. After an approved release, repeat one forward and one reverse quote-only check on the live route and observe the new budget diagnostics.

Production database acquisition contention remains a separate reliability risk requiring its own incident-focused investigation. It was not concealed with stale rates, larger solver budgets or fabricated prices.
