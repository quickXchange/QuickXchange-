---
name: Visual overhaul class contracts
description: A regression-prevention rule for large styling-system replacements in the Quick Xchange app.
---

When replacing the shared visual system, inventory the class names still rendered across public and operator routes before removing legacy selectors. Compilation alone cannot detect lost overlay, drawer, table-containment, or navigation behavior.

**Why:** A coordinated stylesheet rewrite can look correct on the landing page while silently turning operator drawers into ordinary flow content or allowing data-heavy tables and mixed navigation breakpoints to widen the document.

**How to apply:** Before accepting a broad visual rewrite, compare rendered class contracts against defined selectors, then browser-test representative public and operator routes at phone, tablet, and desktop widths. Measure document scroll width, verify tables scroll only inside dedicated containers, and inspect fixed overlay positioning. When utility classes and component-layer media rules both control visibility, choose one breakpoint source of truth or test the exact threshold after CSS-layer compilation.

Treat a visually frozen component as a separate geometry contract when aligning the page around it. Unify outer containers and rhythm without editing that component's width, grid, or control selectors.

**Why:** A landing-page cohesion pass can accidentally resize a working exchange widget when broad shell selectors and breakpoint overrides also match the widget's layout classes.

**How to apply:** Record frozen selectors before the pass, scope cohesion rules to wrappers and neighboring sections, diff widget selectors afterward, and compare the component at the same phone, tablet, and desktop widths.

When removing a late experimental visual layer, separate decorative rules from responsive and accessibility rules even if they were appended together. Preserve touch-target, theme-control, and phone flow geometry contracts while deleting transforms, glow effects, and duplicate surfaces.

**Why:** A broad deletion can correctly remove the unstable visual layer yet also erase unrelated mobile stacking and shared theme-control sizing from the same stylesheet region.

**How to apply:** Reconcile the removed block by behavior, not by comment boundary. Re-run the focused widget suite plus the shared phone touch-target test, and confirm amount inputs precede selectors vertically on narrow phones.

When restyling a component that has several historical selector blocks, explicitly reset layout properties the new rule no longer wants; omitted padding and overflow declarations continue to participate in the computed layout.

**Why:** A visually clipped rail can still retain hidden intrinsic overflow from legacy container padding and whole-container scrolling, causing breakpoint geometry and pinned footer behavior to remain wrong.

**How to apply:** Inspect computed padding and overflow on the container and its scroll owner, then verify `scrollWidth === clientWidth` at exact breakpoints instead of treating `overflow: hidden` as proof the layout fits.

Theme modifiers can change responsive geometry when their selector specificity outranks breakpoint rules. For fixed navigation rails, width alone is not a sufficient contract.

**Why:** A rail that measured correctly in light mode expanded in dark mode because competing theme and breakpoint declarations left flex sizing underconstrained.

**How to apply:** At every supported theme, verify the rail's bounding box and the content offset. Fence fixed rails with matching width, min-width, max-width, and flex-basis inside the breakpoint rule.

Treat the default visibility and stable test identifiers of operational controls as behavior contracts, not styling details. A visual redesign must not hide previously immediate assignment, editing, reconciliation, or history controls behind closed toggles.

**Why:** A polished order-detail rewrite preserved the mutations themselves but initially made core controls absent from the DOM until another action, breaking established operator workflows and browser coverage.

**How to apply:** Inventory the existing interactive selectors and initial visible state before replacing an operational drawer. Preserve them in the first render unless the requested behavior explicitly changes, then run the focused workflow through both provider and manual order variants.

Responsive alternate layouts must not be nested under a parent that the same breakpoint hides; toggle the desktop and mobile children independently.

**Why:** A table-to-card conversion can compile and look correct in CSS review while hiding both representations at phone and tablet widths.

**How to apply:** Keep both variants under a visible containment boundary, assign unique test identifiers to mounted duplicates, and verify visibility immediately below, at, and above the breakpoint.

Never expand a compound selector by inserting a comma into its middle. Add a fully scoped sibling selector instead.

**Why:** A mechanical replacement can turn one scoped rule into an unrelated global branch, silently changing legacy tables and wrappers.

**How to apply:** Write each selector branch completely, then search the diff for partially scoped comma groups before accepting a shared-style change.

For large theme repairs, do not mechanically delete light- or dark-looking selector blocks. Portal components and late breakpoint rules must consume semantic tokens at their own source because they can bypass or outrank shell-level theme styling.

**Why:** Broad selector removal can leave malformed CSS or erase structural behavior, while an unscoped desktop or portal rule can continue forcing dark surfaces after the main shell has been repaired.

**How to apply:** Classify literals before changing them, preserve structural/media/accessibility rules, inspect portal drawers and menus separately, and verify the compiled cascade in both themes across representative routes.

For composite avatars with overlapping badges, legacy descendant selectors must distinguish the main artwork from the nested badge.

**Why:** A dense-layout rule intended to resize a payment logo also matched its nested flag and inflated the badge to nearly the main logo's size.

**How to apply:** Target the main artwork with direct-child selectors, then size the wrapper, main logo, and badge explicitly at every compact breakpoint. Audit higher-specificity `!important` percentage rules in late responsive blocks, and verify computed geometry rather than source declarations.

Desktop Admin headers and main content must share one centered width-and-gutter contract, including when the main content reaches its maximum width.

**Why:** A full-width header with fixed padding looked contained but drifted away from centered main cards on wide desktops; wrapped tablet actions were also clipped by a retained fixed header height.

**How to apply:** Derive header padding from the same main-content maximum width, let wrapped headers grow with visible overflow, and test heading/card edge alignment plus action containment—not only document overflow.

For page-specific Admin header variants, audit every loaded stylesheet for late route-scoped `!important` rules; a shared `grid-area` can still be partially overridden by an older `grid-row` or `grid-column`.

**Why:** The Affiliate header kept placing utility controls on the page-action row even though the final shared grid looked correct; a later route stylesheet forced `grid-row: 2 !important`.

**How to apply:** Search all CSS sources for the route class, inspect computed row and column shorthands separately, then reset placement at the last-loaded boundary. Test dual actions at 768, 820, and 1024px.

When a shared shell has accumulated many historical layout selectors, stop emitting the legacy class names from the replacement component instead of trying to reset every old declaration.

**Why:** Reusing generic Admin heading and action classes let unrelated route and breakpoint rules keep reshaping a new global header even after its own layout was correct.

**How to apply:** Give the replacement shell a dedicated class namespace, deactivate obsolete selector families, and preserve only explicit behavior/test hooks as aliases. Verify computed geometry, not source order.

For responsive widget geometry, treat the last compact-mode rule as the authoritative contract and verify the browser's computed dimensions directly.

**Why:** Editing an earlier matching selector can build successfully while a later phone rule keeps serving the old height, making a requested visual change appear to do nothing.

**How to apply:** Search the full loaded cascade for every matching selector, place the intended phone contract after competing blocks, and add a bounding-box assertion for the exact rendered size.

Apply the same last-match rule to theme repairs when page-specific selectors repeat: scope the final decorative declaration, not an earlier structural declaration with the same selector.

**Why:** A customer widget stayed dark after an earlier duplicate selector was corrected because a later identical selector still supplied the winning dark gradient; scoping the wrong copy also risked disabling shared geometry in Light Mode.

**How to apply:** List every occurrence with surrounding declarations, separate structural sizing from theme-only colors, scope only the final dark decorative block, and verify computed styles after an explicit theme change and reload.

Document-wide form rhythm rules must include portal mount boundaries, not only the application root.

**Why:** Operator drawers and modal forms can render directly under the document body, so a root-scoped global label rule leaves those fields on older route-specific spacing.

**How to apply:** Put shared form spacing at the final loaded cascade boundary, scope it through the document body, preserve inline checkbox/radio layouts explicitly, and verify visible label-to-border geometry inside a portal.

For high-specificity shared visual contracts, expose intentional context and brand variations through CSS custom properties instead of trying to outrank the base selector.

**Why:** Repeated `!important` selectors kept transparent payment-logo defaults active even after a later brand rule added the required circular backing.

**How to apply:** Let the authoritative base rule consume variables for padding, background, and similar controlled variations. Set only those variables on contextual or brand selectors, then assert the browser's computed style.

For visual-only ambient widget motion, prefer scoped multi-layer backgrounds at the final cascade boundary over new overlay elements.

**Why:** An absolutely positioned reflection layer can sit above text, interfere with stacking contexts, or require structural wrappers even when pointer events are disabled. Animated background layers preserve the existing DOM, dimensions, overflow, and hit testing.

**How to apply:** Animate only background position on the existing widget and selected internal surfaces, keep theme-specific opacity low, leave official logo artwork untouched, and disable continuous movement under `prefers-reduced-motion`.

Before tuning an ambient widget treatment, locate the last high-specificity theme reset and place the authoritative decorative contract after it.

**Why:** Repeated light-mode `!important` rules can keep an aurora redesign looking white even when the new gradients are valid; increasing opacity in an earlier block does not change the rendered result.

**How to apply:** Search every matching shell, pseudo-element, and internal-surface selector first. Keep geometry rules untouched, then put the final scoped color/glass rules at the end of the loaded cascade and verify the rendered result before adjusting intensity.