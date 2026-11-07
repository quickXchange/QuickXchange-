---
name: Partner demo boundaries
description: Vynox distribution purpose and the required separation of public demos from the operational exchange.
---

Vynox is the user's white-label distribution platform. Potential partners should
be able to explore a public QuickChange demo directly or through Vynox before
purchasing their own branded exchange.

**Why:** The user explicitly requires that prospect activity must never affect
the operational QuickChange application or expose its customers, credentials or
financial data.

**How to apply:** Keep the demo in an independently deployed project with its own
data and identity realm, fictional fixtures, isolated visitor changes and reset,
and simulated external actions. Never launch it by republishing the operational
exchange project. Allow iframe embedding only for explicitly supplied Vynox
origins; preserve a direct-open fallback.
