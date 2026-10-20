---
name: Bundled test worker cleanup
description: Prevent asynchronous logger workers from racing temporary bundled-test cleanup.
---

Node tests and read-only provider diagnostics bundled into a temporary directory must run without development-only presentation transports such as Pino pretty workers. The launcher must also await the child process `close` event, not only `exit`, before removing bundled output.

**Why:** A bundled logger transport can resolve its worker relative to temporary output where the worker module was never emitted, producing a post-test asynchronous failure after every assertion passes. Waiting only for `exit` also does not prove inherited stdio and descendant handles are closed.

**How to apply:** Set test mode on targets that import the development logger, preserve ordinary child failures, await `close`, and remove temporary files only afterward. Do not use sleeps, suppress worker errors, or globally change test environments when suites intentionally configure their own runtime state.

For live read-only diagnostics, keep provider requests real and scope logger/test
mode to the diagnostic child process. A child that fails before producing a
probe result is not evidence of a provider authentication or connectivity failure.

Libraries that locate native executables relative to their package must not be bundled into temporary test output.

**Why:** esbuild's JavaScript API rejects being relocated into a test bundle because its executable discovery depends on its original package location.

**How to apply:** Keep executable-locating dependencies external or resolve them from the workspace package at runtime; do not install another copy or change application dependencies to compensate.

Provider fixtures must intercept the actual transport, not assume that replacing
global fetch blocks all external I/O.

**Why:** Quickex uses direct Node HTTPS for its production host. A publication
test's fetch mock did not cover background catalogue discovery, so assertions
passed while real provider pagination kept the child alive until timeout.

**How to apply:** Use an isolated local origin or explicit transport fixture
that every request traverses, preserve TLS protections in real code, and verify
that the test process exits cleanly as well as passing its assertions.