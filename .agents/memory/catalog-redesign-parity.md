---
name: Catalog redesign parity
description: Preserving non-obvious operator capabilities when visually unifying multi-tab admin catalogs.
---

Treat visual-only redesigns of multi-tab operator catalogs as behavior-preservation work, not just component replacement. Inventory each tab’s identity metadata, operational side panels, accessible control names, and post-mutation details before introducing a shared row renderer.

**Why:** A shared visual abstraction can look complete while silently dropping tab-specific information or changing established accessibility contracts. Those regressions may surface only late in an end-to-end journey.

**How to apply:** Before editing a consolidated admin catalog, review its existing end-to-end spec and compare every tab’s rendered fields and auxiliary data surfaces. After redesigning, verify the longest existing cross-tab journey rather than checking only the initial directory view.