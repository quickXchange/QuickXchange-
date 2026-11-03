---
name: Browser verification reference
description: Focused browser fixture, interaction, preview and process-cleanup lessons.
---

- [API routing fixtures](playwright-query-route-mocks.md): match query and ID precisely.
- [Fixture contract completeness](browser-fixture-contracts.md) and [custom contexts](playwright-custom-contexts.md).
- [Drawer animations](drawer-browser-verification.md) and [genuine touch events](touch-carousel-verification.md).
- [Input event diagnostics](browser-input-event-verification.md): runner fills can clear and retype slowly; inspect events before blaming quote logic.
- [Routed artifact verification](artifact-preview-verification.md): raw Vite ports do not prove data-dependent routed previews.
- [Stranded test processes](stranded-browser-tests.md): check orphaned browser trees before diagnosing app slowness.
- [Performance measurement safety](performance-measurement-safety.md): separate instrumentation-induced failures and process CPU from main-thread profiles.
- [Client bootstrap SSR fixtures](client-bootstrap-ssr-tests.md): isolated markup tests need a test-only language fixture.
