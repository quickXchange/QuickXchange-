---
name: Environment-specific RPC secret overrides
description: How to avoid validating one RPC credential while deployment resolves another.
---

When an RPC secret appears updated but one runtime keeps returning the old provider behavior, treat environment-specific secret precedence as a possible cause. Validate the endpoint from the actual target runtime, not just from the workspace shell or secret-existence status. If the conflicting value cannot be safely reconciled, use a newly named shared secret and explicitly migrate the monitor configuration to it.

**Why:** Secret existence is reported across environments, but that does not prove every runtime resolves the same value. Financial monitoring must not be declared ready based on a successful check against a different endpoint.

**How to apply:** After credential replacement, restart the relevant workflow, verify the complete required RPC method set in the target runtime, and check persisted health. For endpoint-reference changes, preserve asset identities, watches, cursors, and matching behavior.