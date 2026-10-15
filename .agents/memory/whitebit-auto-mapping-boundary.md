---
name: WhiteBIT automatic identity mapping boundary
description: Distinguish read-only catalog identity metadata from live deposit permission and chain-equivalence proof.
---

Automatic WhiteBIT mapping may save only an unused, unique, deposit-advertised asset/network identity. It must not imply provider assignment, address permission, or Customer Deposits readiness. A live Manual-provider route with Customer Deposits ON may receive unused WhiteBIT identity metadata without changing its Manual provider, wallet, or deposit setting; a live WhiteBIT-provider route with deposits ON remains protected. Changed identities invalidate only that route's old permission proof, not unrelated proofs.

**Why:** Protecting every deposit-enabled row would exclude legitimate Manual routes from catalog classification, while treating a public network label as authorization could wrongly enable a different chain or token. Polygon's customer-facing USDT label can represent an immutable USDT0 route, and AVAX X-Chain is not AVAX C-Chain. A proof for an old identity cannot authorize a changed mapping.

**How to apply:** Require exact unique identity or a narrowly justified sole-network native alias; require same-chain validation in both previews and mutation/verification boundaries. Keep Owner selection separate from exact-route verification and deposit enablement. Never overwrite existing mappings or broaden a proof when applying metadata.

An explicit Owner-authorized bulk provider switch is different from automatic
catalog metadata mapping. It may change the reviewed provider/mapping only after
safe-off, and must preserve the originally requested deposit enablement intent
through failures and retries. Originally OFF routes stay OFF; choosing None
intentionally stays OFF.

**Why:** Reading the current safe-off flag during retry would lose an originally
ON setting. Public support and an old credential-matching proof also cannot
establish that address creation is still permitted after provider-side changes.

**How to apply:** Invalidate only the affected route's old proof before its first
live permission check. Explicit retries may reuse a proof already committed by
that operation, so interrupted verification does not create duplicate addresses.
Unknown in-flight outcomes require visible failure and explicit retry, not blind
remote replay. Preserve frozen order funding and all independent legacy watches.