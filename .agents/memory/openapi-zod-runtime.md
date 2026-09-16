---
name: OpenAPI integer compatibility
description: OpenAPI integer schemas can generate zod.int calls that do not match this workspace's installed Zod runtime.
---

When adding numeric API fields, verify generated validators against the installed Zod version; use numeric constraints such as `multipleOf: 1` when integer generation is incompatible.

**Why:** The generated client and validator packages can be on different Zod major versions, so codegen may succeed while the workspace typecheck fails.

**How to apply:** Run API codegen and the library typecheck immediately after changing the OpenAPI schema, before building consumers.