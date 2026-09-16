---
name: Viewport combobox overlays
description: Constraints for keeping public asset menus visible and interactive across responsive layouts.
---

Searchable selectors have two placement contracts that must stay separate: widget selectors remain anchored inside the exchange card, while non-widget selectors portal to the document as fixed bottom sheets. Do not put widget-only compatibility classes on standalone sheets.

**Why:** Shared legacy classes let later widget-specific breakpoint rules override the standalone sheet's fixed bottom geometry. The result looked correct at one width but silently re-centered or resized elsewhere.

**How to apply:** Give the generic content/search/row shell neutral classes, add widget compatibility classes only to the embedded variant, and test computed position, bottom gap, portal parent, and width at phone, tablet, and desktop sizes.

On phones, an embedded selector must size from the visual viewport and the visible portion of its widget, not only the layout viewport or full widget rectangle. Programmatic search focus must use prevent-scroll behavior.

**Why:** A partially off-screen widget can otherwise pull the selector above the viewport, while focus can move the page or reduce the visual viewport after the initial anchor measurement.

**How to apply:** Recompute on layout and visual-viewport resize, cap height from the visible widget bottom to the visual viewport top, offset a widget bottom that falls below the visual viewport, and wait for entrance animations before asserting bounds.

Closing dialogs may remain mounted while their exit animation runs. Tests and cross-mode queries must identify the open state rather than relying on CSS visibility alone.

**Why:** A closing selector can still have a rendered box for a few hundred milliseconds, causing strict locators to match both the outgoing and newly opened selector.

**How to apply:** Locate active dialogs by their open-state attribute, wait for exit completion only when asserting DOM removal, and wait for entrance completion before measuring animated bounds.

Document-portaled menu content must not depend on layout rules scoped through the trigger's page-shell ancestors.

**Why:** A payment-method identity rendered separate name and metadata nodes, but its column layout was scoped under the public shell. On phones the portal moved the menu outside that shell, so the text collapsed into one visual line.

**How to apply:** Put essential row geometry and hierarchy on menu/component classes that travel with the portal. Keep shell-scoped rules decorative, and test computed layout inside an open phone menu.

Admin settlement selectors use the customer selector shell as document-level bottom sheets at every breakpoint. Preserve wildcard and category semantics independently of presentation.

**Why:** Card-contained and trigger-matched adaptations recreated the cramped legacy selector and diverged from the accepted customer interaction.

**How to apply:** Portal to the document, keep the page visible behind a dark backdrop, preserve total option counts and legacy IDs/callbacks, show wildcard choices only under All, and keep ordinary text searches and native selects unchanged.

When widening a shared combobox, audit width constraints on both the outer combobox and its trigger. The outer control can fill its grid track while an independent trigger max-width still makes the visible field look compact.

**Why:** A pricing selector root correctly expanded to the full column width, but its button remained capped by a separate shared trigger rule, leaving a misleading 160px visible field inside a 298px container.

**How to apply:** Measure the rendered trigger, not only its wrapper. Scope width and max-width overrides to the named form so public widget selectors retain their existing dimensions.