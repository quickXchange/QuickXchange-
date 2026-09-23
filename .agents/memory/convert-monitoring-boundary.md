---
name: Convert and monitoring boundary
description: Architectural rule keeping Convert provider execution independent from Manual Swap blockchain monitoring.
---

Quickex is a Convert-only provider. Convert quote, order, support, status, summary, reconciliation, and notification execution must not be routed through the Manual Swap exchange module or its blockchain-monitoring dependencies.

**Why:** Sharing the route layer allowed unrelated Manual monitoring fixtures and runtime behavior to break Convert verification and blurred ownership of provider side effects.

**How to apply:** Preserve existing public endpoint contracts with ordered dedicated routers. Convert handlers may pass Manual requests onward, but provider modules and monitoring modules must have no bidirectional runtime imports.