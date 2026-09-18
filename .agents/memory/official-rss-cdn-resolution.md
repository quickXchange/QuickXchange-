---
name: Official RSS CDN resolution
description: Safe outbound handling for hardcoded publisher feeds on managed egress networks.
---

For hardcoded, exact-host official publisher feeds, validate HTTPS, credentials, ports, resolved public addresses, and every redirect host, but allow the runtime to select the reachable CDN address. Keep direct DNS pinning for operator-configurable sources.

**Why:** Managed egress successfully reached the official feeds through normal HTTPS resolution while every direct connection to individually validated CDN IPs failed. Retrying more pinned IPv4/IPv6 addresses did not solve it.

**How to apply:** Use this exception only for a small built-in allowlist of publisher-owned hosts. Never extend system resolution to arbitrary operator-provided URLs, and preserve manual redirect validation.