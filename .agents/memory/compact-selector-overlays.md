---
name: Compact selector overlays
description: Adaptive sizing contract for shared public asset and payment-method Search cards.
---

Public Swap and Convert selectors must be content-sized bottom sheets anchored inside the widget on desktop, tablet, and mobile. Only the results list grows and scrolls; one-result and empty states must collapse without filler space.

**Why:** Viewport-level or mid-widget panels felt detached from the exchange surface. The user chose one shared sheet that visibly rises from and returns to the widget’s bottom edge.

**How to apply:** Portal each shared Search sheet into the active widget, bottom-anchor it absolutely at inner-content width, and cap its height below the widget header. Animate open from translateY(100%) to 0 and reverse before unmounting; scroll only the results list. Leave Search unfocused on open so mobile keyboards appear only after a deliberate tap.