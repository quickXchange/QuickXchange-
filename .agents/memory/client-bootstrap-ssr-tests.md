---
name: Client bootstrap in SSR tests
description: Test-only language fixtures for logo rendering must not wait for client API bootstrap.
---

Use a test-only language fixture for isolated static logo-rendering tests; keep browser language regression tests on the real shared provider.

**Why:** The client language provider intentionally withholds its children until language settings and dictionaries are loaded. Server rendering does not run its effects, so wrapping static logo tests in that provider only renders a loading screen. Changing application bootstrap to satisfy those tests would weaken the no-mixed-language contract.

**How to apply:** The Node asset-loader fixture may supply the real English dictionary for isolated rendering assertions. Never apply that fixture to the running app, browser regression tests, or the shared translation-system tests. Keep language availability, switching, and startup verification separate from image markup tests.
