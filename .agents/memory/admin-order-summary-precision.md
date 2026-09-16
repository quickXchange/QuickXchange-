---
name: Admin order summary precision
description: How compact Admin order summaries handle extreme decimal amounts without losing operational precision.
---

Compact Admin order summaries may abbreviate unusually long decimal amounts so the send and receive columns remain separate on phones and tablets. Full exact API values must remain available in the detailed rows, titles, and clipboard actions.

**Why:** Exact fixture values can exceed the intrinsic width of both summary columns and overlap even when the surrounding drawer has no document-level overflow. Formatting the compact summary independently prevents collisions without weakening operational precision.

**How to apply:** Keep summary display formatting separate from clipboard values. Resolve Swap identities from manual settlement options and Convert identities from instant settlement options, and do not broaden the existing safe detail projection during visual redesigns.