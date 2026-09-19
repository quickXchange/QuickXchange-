---
name: You Send crypto authority
description: Defines the boundary between Admin-configured selector visibility and runtime funding validation.
---

Swap → You Send → Crypto visibility follows enabled, non-deprecated Admin asset/network rows with an explicit provider assignment other than None. Do not overwrite this selector authority during startup or provider reconciliation.

**Why:** Automatic capability reconciliation once rewrote Admin route state and collapsed the live selector to one route even though the configured assets, networks, and provider assignments remained intact.

**How to apply:** Build selector direction from Admin enabled/lifecycle/provider fields. Validate Manual wallet address/memo and registered provider capability separately when quoting or creating an order. Never change provider assignments as a side effect.