---
name: Live selector search state
description: Search behavior for selectors whose available options can refresh while the user is typing.
---

Open selectors must preserve the user's query when their option set refreshes. Match a normalized, case-insensitive query as a substring of the option's combined searchable identity fields, including payment method, asset symbol/name, and network.

**Why:** Clearing search state when option IDs changed interrupted incremental typing and made complete-name searches appear more reliable than partial searches.

**How to apply:** Reset query state only when the selector closes, not when live options refresh. Normalize both query and indexed text consistently and update filtering on every input change.