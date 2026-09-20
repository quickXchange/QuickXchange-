---
name: Asset and network state boundaries
description: Why crypto asset catalog edits must not overwrite independently managed network funding state.
---

Crypto asset status, lifecycle, and precision are asset-level catalog settings. Editing them must not clear or rewrite customer-deposit availability on every child network. Network funding state remains independently managed and network-specific.

**Why:** Broad asset edits previously cleared all child-network deposit flags, so changing one catalog record silently disabled unrelated valid networks. Bulk controls also offered an enable action that could not safely verify each network and was always rejected by the API.

**How to apply:** Keep asset and network controls separate. Bulk deposit operations may safely pause selected network rows, but enabling deposits must use the individual verified-wallet/provider flow for each exact asset-network identity.