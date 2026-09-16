---
name: Shared customer-area design
description: Durable visual-system rule for customer routes and the public exchange/tracking entry points linked from them.
---

**Rule:** Treat the customer experience as one design system. Customer routes follow the saved global theme and share one smooth shell background, one typography hierarchy, and one neutral card language. Do not add route-local dark modes, grain, or cosmetic surface variants.

**Why:** Page-specific styling created duplicated texture layers, mismatched cards, conflicting sidebar geometry, and different typography across otherwise related customer journeys.

**How to apply:** Fix visual issues in the shared shell and semantic customer surfaces first. Keep configurable landing artwork inside the editor preview rather than the live exchange shell. Reserve monospace for IDs, hashes, addresses, and exact technical values, and reserve cyan/blue/purple emphasis for active or important interactive elements.

**Rule:** Size customer dashboard columns from the content width left after navigation, not the raw viewport; use a compact widget variant when a two-column tablet layout is explicitly required.

**Why:** The fixed customer sidebar leaves too little usable width at 1024px for horizontal Send/Receive fields, but the approved tablet layout still requires the widget and statistics beside each other.

**How to apply:** Use a roughly 61/39 dashboard split from 1024px, keep the widget's internal fields vertical until its own container reaches 640px, and stack the dashboard sections below 1024px.

**Rule:** Responsive exchange-field layouts inside the dashboard must react to the widget column’s width, not the browser viewport.

**Why:** At laptop widths the page viewport was wide enough to trigger horizontal Send/Receive fields, but the 62% dashboard column was not; payment selectors overlapped across the center.

**How to apply:** Keep the widget vertical below a 640px container width and enable its horizontal field grid only when the widget container itself reaches that width.