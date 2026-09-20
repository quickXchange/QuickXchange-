---
name: Asset and network state boundaries
description: Why crypto asset catalog edits must not overwrite independently managed network funding state.
---

Crypto Assets owns cryptocurrency identity and asset-level catalog settings only. Crypto Networks is the sole Admin owner of network status, provider policy, receiving/fallback addresses, memo/tag, and customer-deposit availability. Each asset-network pair remains an independent record.

This receiving-wallet ownership applies only to Manual Swap. Convert remains independent through its existing Quickex/provider instruments, routing, rates, deposit addresses, and order logic; never make Convert consume Crypto Network receiving-wallet fields.

**Why:** Broad asset edits previously cleared all child-network deposit flags, so changing one catalog record silently disabled unrelated valid networks. Bulk controls also offered an enable action that could not safely verify each network and was always rejected by the API. Sharing these fields with Convert would couple two deliberately separate execution systems.

**How to apply:** Never put network or receiving-wallet controls back into Crypto Assets. Individual Edit operates on one exact route; bulk wallet targets come only from the main Crypto Networks table checkboxes, never from a second selector inside the wallet form. Bulk customer-deposit state defaults to Keep Current; explicit Enable/Disable applies only to selected row IDs. Validate all selected rows and roll back all changes if any row is invalid. Website, Telegram Bot, and Mini App availability must keep asset+network identity and never deduplicate by symbol.