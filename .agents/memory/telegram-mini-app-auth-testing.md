---
name: Telegram Mini App authentication testing
description: How to prove authenticated browser behavior without touching shared chat identities or financial data.
---

Mini App session creation is a database write, not a read-only authentication probe. Verify the real HTTP session and bearer middleware against a fresh schema-only disposable database, synthetic bot/session credentials, and synthetic Telegram identities.

**Why:** Session bootstrap inserts or updates chat mappings even for an existing identity. Mocked browser sessions prove UI behavior but do not prove HMAC validation or database-backed ownership. Copying Development rows is unnecessary for this test and includes real user data.

**How to apply:** Keep session/read-only orders on the actual isolated router, inject signed synthetic initData into the browser, and fail closed on account linking, order linking, and financial creation. Keep real credentials and bearer values out of logs/traces. Stop the fixture service and confirm its disposable database was removed before delivery.

Start a persistent verification fixture from the main agent's background shell, not a detached helper-agent process.

**Why:** Detached child listeners created inside helper shell calls were terminated when those calls ended, even with process-session detachment.

**How to apply:** Let a helper build and verify the isolated harness, then run its listener with the main background-shell tool while the browser tester works. Shut it down gracefully so cleanup finishes.