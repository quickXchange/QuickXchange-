---
name: Asset-network wallet identity
description: Rules for selecting and sharing receiving wallets across crypto assets without symbol or display-name inference.
---

Receiving-wallet updates must identify an immutable asset-network mapping row and verify that it belongs to the submitted asset. Sharing across assets derives from that selected row's exact configured network code; never infer a chain from an asset symbol, asset name, or network display name.

**Why:** Assets can support multiple chains, and multiple assets can use one chain. Display labels and symbols are not stable or unique enough to select a customer deposit destination.

**How to apply:** Admin wallet mutations, Swap quote funding, and order revalidation must preserve the selected asset-network identity. Convert remains provider-address driven and must not consume these configured Swap wallets.