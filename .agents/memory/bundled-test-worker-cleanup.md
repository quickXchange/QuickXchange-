---
name: Bundled test worker cleanup
description: Prevent asynchronous logger workers from racing temporary bundled-test cleanup.
---

Node tests bundled into a temporary directory must run without development-only presentation transports such as Pino pretty workers. The test launcher must also await the child process `close` event, not only `exit`, before removing bundled output.

**Why:** A bundled logger transport can resolve its worker relative to temporary output where the worker module was never emitted, producing a post-test asynchronous failure after every assertion passes. Waiting only for `exit` also does not prove inherited stdio and descendant handles are closed.

**How to apply:** Set test mode on targets that import the development logger, preserve ordinary child failures, await `close`, and remove temporary files only afterward. Do not use sleeps, suppress worker errors, or globally change test environments when suites intentionally configure their own runtime state.