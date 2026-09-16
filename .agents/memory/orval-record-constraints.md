---
name: Orval record constraint gaps
description: How to preserve strict runtime validation when generated Zod omits OpenAPI constraints on dynamic-key objects.
---

Do not assume Orval's Zod output enforces `propertyNames`, `maxProperties`, or nested `additionalProperties: false` for record-shaped schemas. Verify the generated runtime parser and provide an explicit package-boundary parser when these constraints protect persisted configuration or security-sensitive input.

**Why:** Orval 8.23 generated an unconstrained `z.record` and non-strict nested objects from an OpenAPI schema that declared all three constraints, leaving the generated runtime boundary weaker than the documented contract.

**How to apply:** Add parser-level rejection tests for invalid keys, excessive entries, and unexpected nested properties. If a hand-authored exported parser is required, ensure the canonical codegen postprocessor preserves the export override after regeneration.