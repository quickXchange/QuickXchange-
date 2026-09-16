---
name: Newsletter delivery integrity
description: Consent, publication, and link-safety rules for newsletter work.
---

Blog publication and newsletter campaign creation must commit atomically, and the publication event identity must remain stable under concurrent publish attempts.

**Why:** Publishing first and enqueueing afterward can permanently lose a notification; concurrent publishers can otherwise create duplicate campaigns.

**How to apply:** Create the campaign and recipient outbox rows in the same transaction as the conditional draft/scheduled-to-published transition.

An unsubscribed newsletter address is terminal for Admin status changes and cannot be reactivated through public duplicate signup or intermediate status changes.

**Why:** An unsubscribe is a consent decision. Allowing reactivation without verified opt-in lets third parties or operators override it.

**How to apply:** Return opaque subscription receipts, suppress pending delivery when consent becomes inactive, and require a separate verified re-opt-in flow before changing an unsubscribed record.

Read More links must be parsed and origin-checked; relative links reject protocol-relative forms, backslashes, and control characters.

**Why:** URL parsers can interpret apparently relative backslash paths as external hosts.

**How to apply:** Resolve local paths against a fixed HTTPS origin and require the origin to remain unchanged; parse absolute links and reject credentials or unsafe ports.