---
name: Live selector search state
description: Search behavior for selectors whose available options can refresh while the user is typing.
---

Open selectors must preserve the user's query when their option set refreshes. Match a normalized, case-insensitive query as a substring of the option's displayed searchable identity: payment-method name/code for payment methods, and asset symbol/name plus network for crypto.

**Why:** Clearing search state interrupted incremental typing. Indexing hidden shared route metadata also produced false matches—for example, every bank using the SEPA rail appeared in a search for the displayed SEPA payment method.

**How to apply:** Reset query state only when the selector closes, not when live options refresh. Normalize both query and indexed text consistently, update on every input change, and exclude hidden route metadata from payment-method search indexes.