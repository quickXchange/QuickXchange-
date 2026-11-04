# Order-based Profit Dashboard

Development implementation at **Admin → Revenue** (`/admin/revenue`).
This page is an accounting read model, not customer pricing or a settlement engine.

## What counts

- Completed canonical Swap and Convert orders appear automatically.
- Pending, processing, failed and cancelled orders never contribute realized profit.
- Canonical Quickex records take precedence over matching legacy order mirrors.
- Test-marked legacy orders are excluded.
- Reversed/refunded rows remain available for review but their original profit is excluded.
- Missing acquisition or execution evidence means **Cost missing / Profit unavailable**, not zero profit.
- Completion timestamps are not invented where the order only stores creation and update times; the list labels its date as the order's creation time.

## Owner setup

1. Open **Cost basis versions**.
2. Select a discovered route, or enter the exact sending asset/network and receiving asset/network. Discovered routes preserve the immutable payment-option IDs from the saved quote selectors. Optional exact sending/receiving option IDs distinguish bank-specific costs. Leaving them empty explicitly shares that basis across all payment methods on the same asset/network route; more specific matching bases take precedence.
3. Choose the accounting currency. EUR is the default. Enabled currency/asset codes are discovered from Admin catalogs; historical currencies remain selectable.
4. Enter verified **source unit value** (actual proceeds per unit of the asset the desk receives) and **target unit cost** (actual acquisition cost per unit paid out).
5. An accounting-currency unit itself is always `1`. For EUR → USDT, source EUR is `1`; target USDT might cost `0.890` EUR per USDT.
6. Enter provider, network, bank and other fees **explicitly**, including a verified `0` when none apply. All fees are in the selected accounting currency; document any conversion and its original evidence. Flat per-order fees should only be used for routes where that is the actual applicable cost.
7. Supply a receipt/fill/statement reference and attest to the actual execution/costs. Do not put API credentials or customer payment information in this evidence field.
8. Save. The server timestamps an immutable version. It applies only to orders **created after that version**, never to old orders.

Rate versions are accounting assertions, not live market estimates. The dashboard deliberately does not convert yesterday's trades using today's market or customer pricing rules. If actual execution costs differ from a route's saved basis, record a corrective per-order basis with evidence.

For existing completed orders, open **Details / Record verified costs** and attest to the saved execution quantities and historical costs. This appends an accounting record without changing the order or its pricing snapshot. Corrections append another version; earlier versions remain in history.

## Exact calculations

For each verified order:

```
Gross revenue / valued proceeds = executed source quantity × source unit value
Acquisition cost               = executed payout quantity × target unit cost
Gross spread                   = valued proceeds − acquisition cost
Total fees                     = provider + network + bank + other fees
Net realized profit            = gross spread − total fees + audited adjustments
```

All arithmetic uses exact decimal coefficients (`BigInt`), not floating-point money arithmetic. The displayed customer rate comes from the saved execution quantities (including saved final operational amount overrides when present) and is labelled target units per source unit. It does not use accounting overrides.

Examples before fees:

- **Buy:** Customer sends `898 EUR`, receives `1000 USDT`; EUR unit value `1`, acquisition `0.890 EUR/USDT` → `898 − 890 = 8 EUR`.
- **Sell:** Customer sends `1000 USDT`, receives `890 EUR`; actual disposal `0.898 EUR/USDT`, EUR unit cost `1` → `898 − 890 = 8 EUR`.
- If provider/network/bank costs total `3.50 EUR`, net profit is `4.50 EUR`.
- A `900 EUR` acquisition cost against `890 EUR` proceeds is a loss before any fees.
- Crypto-to-crypto uses the same two executed quantities with independently verified values in one accounting currency. Different currencies are **never added together**.

Gross transaction volume is shown separately by the original source asset. It is not revenue, and multiple currencies are not combined into a synthetic total. Valued proceeds are an accounting gross measure, not an assertion of statutory/tax turnover.

## Convert evidence

Quickex's existing synchronization now retains an optional provider-reported actual withdrawal quantity as accounting evidence. It does not change the customer quote or settlement amount. Automatic valuation requires actual paid-source and payout facts, not only an expected quote amount. Older Convert rows without those facts require an Owner's documented historical execution attestation.

Do not treat customer funds held by an external provider, advertised markup, or expected affiliate commission as a verified provider payment. If earnings depend on a provider commission, the Owner must reconcile its actual receipt and costs before attesting a basis.

## Refunds, reversals and adjustments

- The canonical order status controls inclusion; repeatedly saving it cannot insert duplicate profit rows.
- A refund/reversal removes the original net profit from realized totals. Existing lifecycle audit evidence is linked in the detail history when available.
- Actual remaining refund/chargeback expenses or other corrections are entered as a signed **Append adjustment** with a reason.
- Requests are idempotent. Adjustments use the existing accounting currency; it cannot be changed while adjustment history exists.
- These entries affect the report only. They never move funds, initiate a refund, pay an order, or edit payment history.

## Security and preserved history

Read: existing `statistics.view`. CSV: existing `statistics.export`. All cost/rate/adjustment writes: **Owner only**, enforced centrally and on the routes.

The additive tables `order_profit_rates` and `order_profit_records` are append-only, with database triggers and runtime-role update/delete privileges revoked. Original pricing rules, snapshots, orders, old reporting endpoints and their audit/history tables remain intact.

The old expected-revenue UI is replaced, but its reporting service remains because other code/tests still depend on it. No historical records are deleted.

## API

Shared strict runtime input contracts: `lib/api-zod/src/profit-dashboard.ts`. OpenAPI endpoints are registered in `lib/api-spec/openapi.yaml`.

- `GET /api/admin/profit-dashboard`: filters `from`, `to` (order creation date), `search`, `currency`, `paymentMethod`, `type` (`all`, `Swap`, `Convert`), `profit` (`all`, `profit`, `loss`, `missing`), `page`. Currency-separated totals cover all filtered rows, not just the page.
- `GET /api/admin/profit-dashboard.csv`: same filters, all matched rows; exact decimals, no customer personal/payment data.
- `POST /api/admin/profit-dashboard/rates`: strict `ProfitRateInput`; returns immutable ID and server `effectiveAt`.
- `POST /api/admin/profit-dashboard/orders/{Swap|Convert}/{id}/basis`: `ProfitBasisRecordInput`, including UUID `requestId`.
- `POST /api/admin/profit-dashboard/orders/{Swap|Convert}/{id}/adjustments`: `ProfitAdjustmentInput`, including signed amount, currency, reason and UUID `requestId`.

## Development and release safety

Migration `0152_lean_warhawk.sql` is additive and was applied only in Development. Production has not been migrated or published.

Before any approved release, follow the project's existing production migration procedure, verify the two tables and append-only privileges, and release the matching API/UI together. Do not deploy the dashboard against a missing schema.

Rollback should disable/revert the new routes and UI while **retaining accounting tables and their data**, not drop history. No changes to live order/pricing data are required for either rollout or application rollback.

Tests: isolated `order-profit.test.ts`, plus focused browser regression fixtures. Browser fixtures are demonstrations, not Production profit figures.
