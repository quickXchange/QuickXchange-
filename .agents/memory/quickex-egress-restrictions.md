---
name: Quickex egress restrictions
description: Handling network-specific provider rejection of otherwise healthy Quickex public V2 endpoints.
---

Quickex public V2 endpoints can return an empty HTTP 403 from the app server's egress while the same official endpoints return valid live JSON from another network. The provider hostname can also resolve to multiple IPv4 edges where one accepts TCP but never completes TLS or HTTP.

The public pair catalog must be fetched with `offset` and `limit`. The `page` parameter is ignored. An unpaginated response can exceed 18 MB and take nearly a minute, while bounded pages can reconstruct the same directed-route catalog within a few seconds.

**Why:** This is a provider edge, DNS, access-policy, and response-size concern, not evidence that the calculator, endpoint paths, credentials, or public-route authentication contract is broken. Sending signatures to documented unsigned public routes did not bypass egress restrictions, Node's default address selection could repeatedly choose a dead edge, and the provider's growing pair catalog outgrew a single-request loading path.

**How to apply:** Keep quotes and orders fail-closed, preserve the provider's official endpoint contract, and give customers a clear Swap alternative. Select provider addresses only after a certificate-verified TLS handshake, retain the original hostname for SNI and HTTP Host, and cache the healthy selection briefly. Fetch pair catalogs with bounded `offset`/`limit` pagination, deduplicate directed routes, cap total pages, and never treat a transient configured-provider failure as a cacheable empty catalog. Public catalog discovery sits on the widget-loading path, so give it a short dedicated timeout with enough margin for measured provider latency, retry credential proof after transient startup failures, and retain bounded stale data where allowed. Do not shorten quote or order safety timeouts. Never route financial quotes, wallet details, signatures, or orders through an untrusted third-party proxy to bypass the block.