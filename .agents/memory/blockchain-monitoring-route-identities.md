---
name: Blockchain monitoring route identities
description: Why bulk Manual Swap monitoring setup requires an explicit native or token identity.
---

Never infer whether a Manual Swap asset/network route is native or token from the catalog network-family field. Bulk monitoring may enable only routes with an explicit monitor identity; it must never invent a token contract or mint.

**Why:** Existing catalog data can label token routes as native at the network-family level. Treating that field as an asset identity can make a token deposit look like a native transfer.

**How to apply:** Keep native/token identity on the exact monitor asset configuration. An unconfigured route remains incomplete until an operator chooses the identity; token routes additionally require an exact contract or mint.