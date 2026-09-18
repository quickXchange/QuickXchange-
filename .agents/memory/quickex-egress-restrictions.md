---
name: Quickex egress restrictions
description: Handling network-specific provider rejection of otherwise healthy Quickex public V2 endpoints.
---

Quickex public V2 endpoints can return an empty HTTP 403 from the app server's egress while the same official endpoints return valid live JSON from another network. The provider hostname can also resolve to multiple IPv4 edges where one accepts TCP but never completes TLS or HTTP.

The public pair catalog must be fetched with `offset` and `limit`. The `page` parameter is ignored. An unpaginated response can exceed 18 MB and take nearly a minute, while bounded pages can reconstruct the same directed-route catalog within a few seconds. Source-filtered pair discovery can also receive a severe endpoint-specific 429 while the public instrument and quote endpoints remain healthy.

**Why:** This is a provider edge, DNS, access-policy, rate-limit, and response-size concern, not evidence that the calculator, endpoint paths, credentials, or public-route authentication contract is broken. Sending signatures to documented unsigned public routes did not bypass egress restrictions, Node's default address selection could repeatedly choose a dead edge, and the provider's growing pair catalog outgrew a single-request loading path. Pair discovery and quoting have separate provider quotas, so pair failure does not prove quote failure.

**How to apply:** Keep quotes and orders fail-closed, preserve the provider's official endpoint contract, and give customers a clear Swap alternative. Select provider addresses only after a certificate-verified TLS handshake, retain the original hostname for SNI and HTTP Host, and cache the healthy selection briefly. Treat pair discovery as an optional UI optimization: use source filters and bounded pagination when available, but let the authoritative quote endpoint reject unsupported directed routes when pair discovery is rate-limited. Never retry a provider 429 immediately. Do not cache a transient failure as an empty catalog, shorten quote or order safety timeouts, or route financial traffic through an untrusted proxy.