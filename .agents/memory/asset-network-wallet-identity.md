---
name: Asset-network wallet identity
description: Rules for selecting and updating receiving wallets by exact crypto asset-network identity.
---

Receiving-wallet updates must identify one immutable asset-network mapping row, verify that it belongs to the submitted asset, and change only that row. Never propagate addresses, memos, providers, or deposit settings to sibling rows, even when they share a network code.

Deposit-provider policy is also owned by that exact row, but it is never shared when an operator shares a wallet across assets. A selected API provider tries its idempotent adapter first, then permanently projects that order onto the same row's snapshotted manual wallet when the call is unavailable, rejected, malformed, or ambiguous. Once exposed, that fallback address cannot later switch to a recovered API address.

**Why:** Assets can support multiple chains, and multiple assets can use one chain. Display labels and symbols are not stable or unique enough to select a customer deposit destination. Switching an address after showing it to a customer can strand funds.

**How to apply:** Admin saves, Swap quote funding, and order revalidation must preserve the selected asset-network row identity. Reject legacy cross-row sharing flags, and test that sibling rows remain byte-for-byte unchanged. Keep provider claims fenced and Convert provider-address driven.

Receiving-wallet memo/tag values may be omitted only when the exact network does not require one. Every supplied memo is syntax-validated; an empty memo clears the value, but a required memo must be present before enabling customer deposits.

**Why:** Malformed or missing required destination tags can make valid-address deposits irrecoverable. Optional memo fields still need validation when populated.

**How to apply:** Validate every non-empty memo against the selected asset-network row. When `requiresMemo` is true, reject enabling until a valid memo is saved.

Bulk catalog edits must identify every affected asset-network row explicitly and update only fields whose Apply control was selected. Confirmation must freeze and display the exact request; omitted provider, address, memo, and deposit fields are never inferred or rewritten.

**Why:** Broad object spreading or client-side batches can silently replace sensitive routing configuration, partially apply changes, or confirm more assets than the atomic request actually contains.

**How to apply:** Expand compatible network selections to existing immutable row IDs, validate effective provider/deposit state before any write, and commit all requested changes in one transaction. WhiteBIT targets require the same mapped asset/network identity and live provider availability used by provisioning.

Manual fallback address or memo edits on an already configured WhiteBIT route remain available during provider or capability outages. Strict WhiteBIT checks apply when assigning the provider or enabling deposits, not when maintaining fallback data.

**Why:** The manual address is the final recovery path when provider address generation fails; requiring the provider to be healthy before saving that recovery data makes outages harder to resolve.

**How to apply:** Preserve provider and deposit state for address-only edits. Runtime provisioning decides whether to use WhiteBIT or the saved manual fallback and must never clear the stored fallback on provider failure.

Crypto Assets Bulk Edit is manual-purpose only: it cannot assign or switch API providers and cannot change WhiteBIT-managed network fields. WhiteBIT provider configuration remains in API Integrations and its dedicated management flows.

**Why:** Mixing provider configuration into generic catalog bulk actions can bypass provider-specific capability and lifecycle controls.

**How to apply:** Reject provider fields at the raw bulk API boundary. On an existing WhiteBIT route, allow only manual fallback address, fallback memo, and memo-requirement maintenance.

Provider Policy options come from connected, enabled API integrations that have a registered deposit-address adapter. Integration credentials alone never make a rate, Convert, or unrelated provider selectable for Swap deposits.

**Why:** Deposit-address APIs are provider-specific and carry irreversible idempotency and reconciliation requirements. Listing a connected integration without an implemented adapter would save a policy that cannot safely generate or attribute an address.

**How to apply:** Register each real deposit adapter once, derive Admin options from its live integration state, preserve arbitrary registered IDs in API/UI contracts, and keep Manual Only plus None available independently.