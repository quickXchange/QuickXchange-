---
name: Artifact preview verification
description: Avoid misleading UI results when a raw frontend port bypasses artifact API routing.
---

Verify data-dependent UI through the routed artifact preview rather than the raw Vite development port.

**Why:** The raw frontend port can render the app while bypassing the artifact's API proxy, making valid live configuration appear unavailable and producing misleading empty-state screenshots.

**How to apply:** Use the resolved app preview or artifact-routed URL for browser screenshots and live data checks. Use the raw Vite port only for checks that do not depend on routed APIs.

Lazy landing sections may be absent from a browser snapshot taken before their viewport sentinel is reached, even though the page is healthy.

**Why:** Scrolling to the bottom immediately after `domcontentloaded` can happen before hydration expands the document. The observer then never sees its sentinel, and later section selectors time out.

**How to apply:** Wait for the rendered landing shell, scroll to the current document bottom, then wait for the deferred cards before measuring or capturing them. Do not mistake an unmounted deferred section for a failed style change.

The remote testing browser does not share the workspace's loopback network. A temporary local test server needs an exposed route before that browser can reach it.

**Why:** A healthy temporary server was unreachable through the remote browser's localhost; the registered proxied preview worked.

**How to apply:** Prefer the registered preview with browser-scoped fixtures for isolated remote UI checks. Do not interpret an unexposed local-port connection failure as an application failure.