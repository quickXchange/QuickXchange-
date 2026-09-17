---
name: Asset-network wallet identity
description: Rules for selecting and sharing receiving wallets across crypto assets without symbol or display-name inference.
---

Receiving-wallet updates must identify an immutable asset-network mapping row and verify that it belongs to the submitted asset. Sharing across assets derives from that selected row's exact configured network code; never infer a chain from an asset symbol, asset name, or network display name.

Deposit-provider policy is also owned by that exact row, but it is never shared when an operator shares a wallet across assets. A selected API provider tries its idempotent adapter first, then permanently projects that order onto the same row's snapshotted manual wallet when the call is unavailable, rejected, malformed, or ambiguous. Once exposed, that fallback address cannot later switch to a recovered API address.

**Why:** Assets can support multiple chains, and multiple assets can use one chain. Display labels and symbols are not stable or unique enough to select a customer deposit destination. Switching an address after showing it to a customer can strand funds.

**How to apply:** Admin saves, Swap quote funding, and order revalidation must preserve the selected asset-network row identity. The Admin editor may hydrate address/memo fields from another asset only by exact network code, then save through the selected row; never infer a chain from labels or symbols. Keep provider claims fenced and Convert provider-address driven.

Receiving-wallet memo/tag values are optional Admin metadata even when a network advertises memo support. Address validity and memo presence are separate; an empty submitted memo explicitly clears the saved value and must not block saving or enabling a wallet.

**Why:** Some fallback wallets do not require a destination tag even on networks that support tags, and coupling memo validation to network metadata prevents operators from saving a valid fallback address.

**How to apply:** Show and persist a memo only when entered. Keep network `requiresMemo` metadata for provider/customer transaction contexts that genuinely require it, but do not use it to validate Admin fallback-wallet configuration.

Bulk catalog edits must identify every affected asset-network row explicitly and update only fields whose Apply control was selected. Confirmation must freeze and display the exact request; omitted provider, address, memo, and deposit fields are never inferred or rewritten.

**Why:** Broad object spreading or client-side batches can silently replace sensitive routing configuration, partially apply changes, or confirm more assets than the atomic request actually contains.

**How to apply:** Expand compatible network selections to existing immutable row IDs, validate effective provider/deposit state before any write, and commit all requested changes in one transaction. WhiteBIT targets require the same mapped asset/network identity and live provider availability used by provisioning.

Provider Policy options come from connected, enabled API integrations that have a registered deposit-address adapter. Integration credentials alone never make a rate, Convert, or unrelated provider selectable for Swap deposits.

**Why:** Deposit-address APIs are provider-specific and carry irreversible idempotency and reconciliation requirements. Listing a connected integration without an implemented adapter would save a policy that cannot safely generate or attribute an address.

**How to apply:** Register each real deposit adapter once, derive Admin options from its live integration state, preserve arbitrary registered IDs in API/UI contracts, and keep Manual Only plus None available independently.