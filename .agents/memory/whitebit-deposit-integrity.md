---
name: WhiteBIT deposit integrity
description: Durable identity, ledger, and reconciliation rules for WhiteBIT customer deposits.
---

Credit eligibility requires a stable WhiteBIT transaction or unique ID. When both appear over time, they are aliases for one deposit and must be locked and resolved together. Once credited, economic fields stay frozen; conflicting terminal replays are quarantined for review rather than changing history without a ledger adjustment.

**Why:** WhiteBIT webhook and history records can expose different identifier combinations, corrected amounts, and network-qualified tickers. Treating each representation independently can double-credit or desynchronize the immutable balance ledger from customer history.

**How to apply:** Normalize provider tickers separately from the base asset/network request contract, lock every stable alias in deterministic order, credit once per immutable deposit row, and reconcile each address from offset zero to its high-water identity without requesting beyond the provider’s 10,000-record window.