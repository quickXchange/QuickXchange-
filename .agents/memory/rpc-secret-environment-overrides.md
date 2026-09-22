---
name: Environment-specific RPC secret overrides
description: How to avoid validating one RPC credential while deployment resolves another.
---

When an RPC secret appears updated but one runtime keeps returning the old provider behavior, treat environment-specific secret precedence as a possible cause. Validate the endpoint from the actual target runtime, not just from the workspace shell or secret-existence status. If the conflicting value cannot be safely reconciled, use a newly named shared secret and explicitly migrate the monitor configuration to it.

**Why:** Secret existence is reported across environments, but that does not prove every runtime resolves the same value. Financial monitoring must not be declared ready based on a successful check against a different endpoint.

**How to apply:** After credential replacement, restart the relevant workflow, verify the complete required RPC method set in the target runtime, and check persisted health. For endpoint-reference changes, preserve asset identities, watches, cursors, and matching behavior.

Alchemy's BNB Smart Chain Free tier limits `eth_getLogs` to 10 inclusive blocks. The monitor's range value is an offset (`to - from`), so a value of 9 is the compatible bound; a healthy one-block probe alone does not prove token cursor scans will work.

**Why:** Chain ID, head, block, receipt, and single-block log probes can all pass while a wider USDT scan fails with JSON-RPC `-32600`.

**How to apply:** Validate both the health probe and a full production-sized token scan range whenever the BSC provider or plan changes.