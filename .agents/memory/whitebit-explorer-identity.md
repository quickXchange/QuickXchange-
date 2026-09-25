---
name: WhiteBIT explorer identity
description: Safety boundaries for projecting WhiteBIT blockchain transaction hashes and explorer links.
---

Customer-visible WhiteBIT transaction IDs come only from the deposit's persisted blockchain hash, never the provider deposit ID, editable order support fields, or memo. Explorer selection follows the order's frozen asset and provider-network identity; a current route's edited identity is not authoritative.

**Why:** A proven BNB order was funded on BEP20, but its older canonical route had no explorer template while a matching BEP20 catalog route did. Looking only at the old row loses a valid link; blindly using whatever the old route is edited to later risks linking to the wrong chain.

**How to apply:** Keep this a read-only order-detail projection, validate the exact order/deposit/address claim, and use configured HTTPS explorer metadata only when the frozen network matches it. If the hash or matching metadata is absent, show no link. Keep deposit detection and reconciliation independent of presentation.