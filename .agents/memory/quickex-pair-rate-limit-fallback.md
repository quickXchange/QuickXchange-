---
name: Quickex pair-rate-limit fallback
description: Availability and safety boundary when Quickex rate-limits its public directed-pair catalog.
---

When the Quickex pair catalog returns a rate-limit response, Convert may temporarily build selector combinations from configured, mapped Quickex capabilities. A live Quickex quote must still succeed before the app signs a quote or permits order creation. Do not use this fallback for malformed catalogs, authentication failures, or general provider outages.

**Why:** The public pair endpoint can remain rate-limited after a request burst, causing every Convert configuration request to fail indefinitely even while live quote and signed-order services remain healthy.

**How to apply:** Fetch pair pages sequentially, retain a bounded stale catalog, and suppress repeated refreshes after failure. Restrict the broader capability fallback to provider rate limiting; keep live quote validation authoritative and preserve all signed-order runtime-proof checks.