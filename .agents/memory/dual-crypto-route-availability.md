---
name: Dual crypto route availability
description: Why a configured cryptocurrency network can remain available to both manual Swap and automatic provider Convert.
---

An enabled, non-deprecated cryptocurrency network mapped to a healthy provider may participate in automatic Convert even when its catalog row remains marked for manual execution. Only catalog-only rows are excluded from provider capability discovery.

Provider instruments without a corresponding manual-catalog row remain ephemeral provider capabilities. They use deterministic provider-scoped settlement IDs and must not be inserted into or represented as manual custody routes.

**Why:** Treating manual and API execution as mutually exclusive emptied Convert whenever operators kept the same network available for human-processed Swap. Requiring every provider instrument to exist in the curated manual catalog also reduced a large live provider catalog to a handful of mapped assets. Provider credentials, exact live instruments, directed pairs, and signed quote/order checks establish whether provider-only Convert routes are executable.

**How to apply:** Preserve manual settlement filtering for Swap, but derive Convert capability from signed credentials and live directed pairs. Honor enabled/lifecycle/catalog-only controls when an unambiguous manual row maps to the provider instrument. Keep provider-only instruments out of manual options and give them stable provider-scoped IDs. Never expose disabled, deprecated, ambiguous, inactive-pair, or unsigned routes.