---
name: Playwright query route mocks
description: Prevent browser-test API mocks from silently missing requests after query parameters become required.
---

Playwright path globs that end exactly at an API pathname may stop matching once generated clients append required query parameters. Prefer a regex that accepts either the query delimiter or the end of the URL.

**Why:** A summary endpoint gained required filters, and existing path-only mocks silently fell through to the live backend. The UI mounted with unrelated data, making the first failures look like rendering or cache bugs rather than interception failures.

**How to apply:** When changing an endpoint from an unfiltered URL to a query-based contract, audit browser route mocks for that pathname and verify the interceptor observed the request before asserting response-driven UI.