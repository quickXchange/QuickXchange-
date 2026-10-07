---
name: Order creation provenance
description: Frozen channel attribution and conservative historical origin display in Admin.
---

Admin Order Information shows Website, Telegram Mini App, Telegram Bot, or Unknown in place of its former Rate row. Exchange Details retains its separate Exchange Rate.

**Why:** The user requested creation-channel provenance without duplicating Exchange Rate or changing the existing row presentation.

Freeze creation origin when a new Swap or Convert order is inserted. Replays, later Telegram links, customer ownership claims, and order updates must not replace it. Historical orders without recorded evidence remain Unknown; a Telegram link alone does not distinguish a Bot creation from a Mini App creation or a website order linked later.

**Why:** Linking and creation are different events, and the user explicitly prohibits guessing historical origins.

**How to apply:** Use verified Mini App session provenance and server-attested Bot creation requests. Preserve the original origin across idempotent creates and reconciliation. Do not infer an origin from the current viewing surface, referrer, customer identity, or a later tracking link.
