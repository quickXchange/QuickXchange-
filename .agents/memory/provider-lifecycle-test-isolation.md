---
name: Provider lifecycle test isolation
description: Deterministic provider lifecycle tests with layered caches and disabled-by-default integrations.
---

Provider lifecycle tests that change mocked remote state must invalidate both durable cooldown state and process-local snapshots before polling again. Tests for disabled-by-default providers must enable them only inside test setup and restore the prior setting afterward.

**Why:** Updating only the database cooldown left a fresh in-process Quickex snapshot active, making completion assertions depend on suite order. WhiteBIT integration tests inherited the required disabled setting and correctly returned conflicts until setup enabled it temporarily.

**How to apply:** When a test changes a mocked provider response within one process, reset all cache layers through a narrow test hook. Save and restore provider configuration around tests; never enable a blocked provider globally to satisfy a test.