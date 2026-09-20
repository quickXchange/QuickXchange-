---
name: Asset and network state boundaries
description: Why crypto asset catalog edits must not overwrite independently managed network funding state.
---

Crypto Assets owns cryptocurrency identity and asset-level catalog settings only. Crypto Networks is the sole Admin owner of network status, provider policy, receiving/fallback addresses, memo/tag, and customer-deposit availability. Each asset-network pair remains an independent record.

**Why:** Broad asset edits previously cleared all child-network deposit flags, so changing one catalog record silently disabled unrelated valid networks. Bulk controls also offered an enable action that could not safely verify each network and was always rejected by the API.

**How to apply:** Never put network or receiving-wallet controls back into Crypto Assets. Multi-network wallet saves must be explicit and transactional: validate every selected row, update only those row IDs, and roll back all changes if any selected network is invalid. Website, Telegram Bot, and Mini App availability must keep asset+network identity and never deduplicate by symbol.