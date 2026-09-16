---
name: Provider support metadata
description: Rules for adding mutable Admin support fields to provider-managed orders without changing provider-owned execution data.
---

Store mutable operational support fields for provider-only orders in a versioned sidecar keyed by the logical order ID. Never write Admin overrides into provider settlement, amount, rate, status, or reference fields.

**Why:** Provider-only orders may not have a local exchange-order row. A sidecar preserves provider ownership while supporting atomic Admin updates, but spreading its full database row can overwrite projected timestamps and other order fields. Using a common field name such as `provider` as an internal boolean result tag can also collide with the order's provider-name string and select the wrong response path.

**How to apply:** Fence sidecar creates and updates with its own record version, audit every changed support field, and project only the explicit support-field allowlist onto provider responses. Use an unambiguous discriminated result tag such as `kind: "provider-support"` rather than testing a domain field for truthiness.