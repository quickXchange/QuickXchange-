---
name: Automatic customer deposit eligibility
description: Defines the fail-closed rule for enabling customer deposits on crypto asset-network rows.
---

Customer Deposits must be derived from usable receiving capability, not from an operator checkbox alone. A row is eligible when its saved address is valid for the network (including a required valid memo/tag), or its assigned active provider has fresh exact deposit capability for that asset-network. Provider policy None is always ineligible.

**Why:** Persisted enabled flags can drift from wallet and provider reality. Enabling without a validated receiving path can accept customer funds that the system cannot identify or settle.

**How to apply:** Reconcile all existing rows when Admin opens Crypto Assets, and apply the same evaluator whenever receiving-wallet data is saved. Provider failures and unsupported routes remain disabled; never create a provider-side address merely to perform a health check.