---
name: Instant widget mode switching
description: Performance and interaction constraints for switching between heavyweight exchange modes.
---

Keep heavyweight exchange mode trees mounted and preserve a single page shell. Switch only composited layer state, accessibility state, and active controls; do not route the mode through a parent that re-renders the landing page or both form trees.

**Why:** Conditional page trees and first-use painting caused visible freezes. Hiding an unselected tree with visibility also deferred its paint cost until the click, while synchronous analytics blocked animation frames.

**How to apply:** Precompose inactive modes at zero opacity, use a short fade without positional transforms, preserve fixed outer geometry, keep inactive content non-interactive, and defer nonvisual work until after the transition. Because inactive trees still mount and run data hooks, normalize optional configuration collections and render unavailable states safely; focused fixtures may omit the inactive provider’s configuration. Scope browser measurements and assertions to the active mode layer; page-wide selectors can match retained inactive controls and report false overlap or geometry failures.

Never replace an entire fixed-size mode card with a loading skeleton while configuration or provider data is pending. Render the real shell immediately, use skeletons only inside dependent fields, and start hidden-mode data during browser idle with click-time promotion and a shared query cache.

**Why:** A full-card loading branch left only an empty 640–670px container visible during slow provider configuration, even though mode activation itself completed synchronously.

**How to apply:** Keep the inactive form mounted, make its query idle-enabled unless that mode is initially active, enable it immediately on selection, and verify click-to-shell timing with the provider response deliberately delayed.

Auxiliary widget screens such as navigation must be sibling layers inside the shared exchange viewport, never page-level portals. Keep both exchange forms mounted and make them inert and transparent while the auxiliary screen is active.

**Why:** Remounting or replacing a form tree loses entered amounts and selected routes, while a standalone portal changes the interaction from an in-widget state to a page modal.

**How to apply:** Give the auxiliary active layer explicit absolute inset positioning because historical active-mode CSS may make active layers relative. Restore the prior mode’s accessibility state and focus when the auxiliary screen closes.

When the form layer becomes transparent, the auxiliary layer must render a full-size visual exchange shell before placing any compact panel inside it.

**Why:** Hiding the mounted form’s whole layer also hides its card background, border, radius, and glow; a compact menu by itself then makes the exchange widget appear to disappear.

**How to apply:** Keep the auxiliary layer aligned to the unchanged viewport, render a shell with the normal exchange-card geometry, and inset the natural-height panel within that shell.