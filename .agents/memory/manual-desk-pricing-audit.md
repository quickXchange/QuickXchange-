---
name: Manual desk pricing audit snapshots
description: Durable integrity requirements for reconstructing route-priced manual quotes after rules and market caches change.
---

Manual desk pricing snapshots must be immutable, signed, and persisted with canonical decimal strings. Include the matched rule selectors and terms, exact arithmetic outputs, explicit rounding policy, normalized quote context, and separate source/target market-rate provenance with the real provider and original observation or fetch timestamp.

Bind mutable execution terms too: option limits, direction-specific instructions, required fields, crypto funding details, and network-specific memo/tag requirements. Revalidate them before creating an order and fail closed when they drift.

**Why:** Final receive amounts alone prevent repricing but cannot independently explain a disputed quote after an operator edits the rule. Mutable settlement instructions or permissive memo handling can also make an accepted order unusable or direct funds under terms the customer never approved. Generic provider labels and timestamps generated at quote time corrupt evidence when cached rates came from different providers or were fetched earlier.

**How to apply:** Verify selector matching, execution-term equality, and every financial identity by exact integer recomputation before order persistence. Validate required memos by network rather than presence alone. Preserve cache timestamps across reuse, keep execution provider separate from reference providers, use typed closed snapshot contracts, and serialize very small rates without exponent notation.

Fiat rate-source settings and provider-backed Swap pricing remain executable. A concrete exact path is an optional override; for example, `EUR → XMR = 4` means one EUR converts to four XMR before configured fees, and the reverse uses the exact reciprocal unless explicitly configured.

**Why:** The operator requires all existing Swap paths to continue working and exact manual pricing to remain an optional choice.

**How to apply:** Prefer explicit direct paths over reciprocals, then use established selector/provider pricing. Exact overrides require canonical settlement identities and signed provenance. Existing fallback snapshots retain market/provider provenance. Convert remains unchanged.