---
name: Artifact preview verification
description: Avoid misleading UI results when a raw frontend port bypasses artifact API routing.
---

Verify data-dependent UI through the routed artifact preview rather than the raw Vite development port.

**Why:** The raw frontend port can render the app while bypassing the artifact's API proxy, making valid live configuration appear unavailable and producing misleading empty-state screenshots.

**How to apply:** Use the resolved app preview or artifact-routed URL for browser screenshots and live data checks. Use the raw Vite port only for checks that do not depend on routed APIs.