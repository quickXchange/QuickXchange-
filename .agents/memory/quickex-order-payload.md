---
name: Quickex order creation payload
description: Field rules for POST /orders/public/create on Quickex V2
---

# Quickex order creation payload

- Omit `markup` from the order-create payload unless a `referrerId` is also sent. Sending `markup: "0"` alone is rejected with "markup requires referrerId key".
- **Why:** Quickex ties markup to referral accounts; the public quote endpoint accepts `markup=0` as a query param, but order creation validates the pair strictly — so quote and create have different rules.
- **How to apply:** any change to `createQuickexOrder` payload must keep `markup` absent (or add a real `referrerId`); the quote call can keep `markup=0`.
- Live create responses can return only a UUID even though the documented example shows numeric IDs. Capture the signed order-list IDs before and after a serialized create; a single new ID is the canonical identity.
- **Why:** the signed order list omits the create UUID, so relying on documented create fields can leave completed orders impossible to reconcile exactly.
- **How to apply:** prefer any numeric create ID; otherwise use the single causal list-ID set difference. Never reconstruct identity from addresses, amounts, emails, routes, or timestamps.
- List items expose progress as a lowercase `state` string (e.g. `created`) plus a `completed` boolean; treat `completed: true` as authoritative even if `state` lags.
- The signed order list can return a negative `amountToGet` sentinel or string `"0"` for `amountToWithdrawFact` before payout. Only positive payout values may replace the quoted destination amount.
