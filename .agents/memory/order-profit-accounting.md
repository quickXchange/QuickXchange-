---
name: Order-profit accounting scope
description: Owner requirements and evidence boundaries for realized profit, historical costs and accounting-currency separation.
---

The Owner's current primary accounting currency is EUR. Revenue reporting is order-based and only final completed Swap/Convert orders qualify for realized profit. Existing orders and customer pricing must not be rewritten to implement accounting.

**Why:** The Owner explicitly rejected the older expected-fee/pricing-version report in favor of actual executed quantities, verified acquisition costs, fees and losses.

**How to apply:** Keep transaction volume, gross spread and net profit distinct. Never combine currencies without independently evidenced historical conversion. Missing historical acquisition evidence means profit unavailable, never a synthetic zero or today's market price.

My Rates uses rates applicable at **completion**, not creation or delayed worker processing. Legacy route Cost Basis versions keep their old creation-time semantics for historical compatibility, but must not be exposed as the primary Owner UI.

**Why:** The Owner explicitly changed the desired behavior: an order completing tomorrow uses tomorrow's configured buy/sell rates, while yesterday's completed orders retain their frozen rates and profit.

**How to apply:** Freeze the committed rate versions and verified executed quantities at the completion boundary. Timestamp-only lookup later is insufficient: an edit may have been uncommitted at completion. Missing or ambiguous rates stay unavailable, even if configured before a delayed worker runs. Keep corrections append-only and retain accounting history during rollback.

The Owner UI must have four summary cards, a compact My Rates section, and completed Swap/Convert orders with simple Edit controls for Buy Rate, Sell Rate, Partner Fee and Receiving Fee. Preserve legacy accounting backend controls/history without exposing complicated Cost Basis Versions screens. Partner Fee uses acquisition cost; Receiving Fee uses sale proceeds.

**Why:** The Owner explicitly requested a simpler automatic workflow for both Swap and Convert while retaining financial safeguards. Fee bases must be explicit to avoid inconsistent previews or double-counting older fees.

**How to apply:** Retain existing fixed costs and auditable adjustments exactly once during per-order edits; never reinterpret their currency. Different currencies require verified conversion. Period totals use recorded UTC completion dates; undated legacy profit belongs only in all-time totals.
