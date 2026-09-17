---
name: Asset-network wallet identity
description: Rules for selecting and sharing receiving wallets across crypto assets without symbol or display-name inference.
---

Receiving-wallet updates must identify an immutable asset-network mapping row and verify that it belongs to the submitted asset. Sharing across assets derives from that selected row's exact configured network code; never infer a chain from an asset symbol, asset name, or network display name.

Deposit-provider policy is also owned by that exact row, but it is never shared when an operator shares a wallet across assets. A selected API provider tries its idempotent adapter first, then permanently projects that order onto the same row's snapshotted manual wallet when the call is unavailable, rejected, malformed, or ambiguous. Once exposed, that fallback address cannot later switch to a recovered API address.

**Why:** Assets can support multiple chains, and multiple assets can use one chain. Display labels and symbols are not stable or unique enough to select a customer deposit destination. Switching an address after showing it to a customer can strand funds.

**How to apply:** Admin wallet/provider mutations, Swap quote funding, and order revalidation must preserve the selected asset-network identity. Keep provider claims fenced, snapshot the exact fallback before the call, and never search another row for a wallet. Convert remains provider-address driven and must not consume these configured Swap wallets.

Provider Policy options come from connected, enabled API integrations that have a registered deposit-address adapter. Integration credentials alone never make a rate, Convert, or unrelated provider selectable for Swap deposits.

**Why:** Deposit-address APIs are provider-specific and carry irreversible idempotency and reconciliation requirements. Listing a connected integration without an implemented adapter would save a policy that cannot safely generate or attribute an address.

**How to apply:** Register each real deposit adapter once, derive Admin options from its live integration state, preserve arbitrary registered IDs in API/UI contracts, and keep Manual Only plus None available independently.