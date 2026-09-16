---
name: Quickex address preflight
description: How to handle Quickex address-validation 403s without weakening order safety.
---

Treat an isolated HTTP 403 from Quickex's address-validation endpoint as preflight unavailability only when the same credentials still authenticate against the signed Order API. Defer final address validation to signed order creation, which must remain fail-closed and return the provider's deterministic address or memo error.

**Why:** Quickex's published instrument documentation changed the displayed validation route, but both the old and current routes returned an empty `Forbidden` response while the same signed credentials successfully accessed orders. Blocking on that preflight made every valid Convert attempt fail with a misleading malformed-response error.

**How to apply:** Keep local route and required-memo checks before submission. Do not bypass authorization failures from order creation or order listing, and do not issue a deposit address unless signed creation succeeds.