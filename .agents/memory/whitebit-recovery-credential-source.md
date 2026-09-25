---
name: WhiteBIT recovery credential source
description: Why a read-only WhiteBIT history preview must choose its credential source explicitly.
---

Read-only WhiteBIT history previews must select stored or environment credentials explicitly and fail closed on authentication errors; do not silently retry with another credential source.

**Why:** In Development, a signed history preview using the stored credential returned HTTP 401 while the configured environment credential succeeded for the same frozen order/address. The two credential sources are not necessarily interchangeable, and automatic fallback could obscure which account supplied financial evidence.

**How to apply:** For operator-reviewed recovery previews, record which source was selected without disclosing credentials. Revalidate the exact order/address and provider transaction evidence before any approved write. Do not assume a 401 proves the deposit is missing.