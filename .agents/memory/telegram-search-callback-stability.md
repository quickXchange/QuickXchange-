---
name: Telegram search callback stability
description: Safety rule for searchable, paginated Telegram route-selection buttons.
---

Filtered and paginated Telegram option buttons must encode the option's canonical session index, not its position in the current filtered result set.

**Why:** Telegram keeps older inline-keyboard messages active. If callbacks use filtered positions, changing the search query can make an old button resolve to a different financial route.

**How to apply:** Build labels and pages from filtered results, but resolve each button back to the immutable source or target array stored in the wizard session. Selection handlers must read that canonical array directly.