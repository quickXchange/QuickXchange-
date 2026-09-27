---
name: Playwright query route mocks
description: Keep browser-test API mocks aligned with query strings and disjoint from similarly named mutation routes.
---

Playwright path globs that end exactly at an API pathname may stop matching once generated clients append required query parameters. Prefer a regex that accepts either the query delimiter or the end of the URL.

**Why:** A summary endpoint gained required filters, and existing path-only mocks silently fell through to the live backend. The UI mounted with unrelated data, making the first failures look like rendering or cache bugs rather than interception failures.

**How to apply:** When changing an endpoint from an unfiltered URL to a query-based contract, audit browser route mocks for that pathname and verify the interceptor observed the request before asserting response-driven UI.

Order-status mocks also need to match concrete order IDs (or restrict to GET). A generic `orders/[^/]+/status` pattern matches the unrelated `orders/bulk/status` mutation.

**Why:** A completed-order PDF fixture intercepted a bulk status POST, returned a successful customer-status object instead of a bulk result, and made the Admin bulk action fail far from the new invoice assertions.

**How to apply:** Scope fixtures by resource identity and method when a dynamic URL segment can be a reserved route word. Assert the intended status request was actually intercepted.