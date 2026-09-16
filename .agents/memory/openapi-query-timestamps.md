---
name: OpenAPI query timestamps
description: How to keep generated timestamp query validators compatible with HTTP strings and reject normalized impossible dates.
---

Define HTTP query timestamps as constrained strings rather than `format: date-time` when the generated server validator would otherwise require a JavaScript `Date`.

**Why:** Express supplies query parameters as strings, but this workspace's generator can emit `z.date()` for reusable date-time query parameters. A shape-only ISO regex also accepts impossible dates that JavaScript silently normalizes.

**How to apply:** Use the workspace's canonical UTC timestamp string pattern for query parameters, convert only after validation, reject non-finite dates, and require the parsed UTC serialization to equal the submitted timestamp before database use.