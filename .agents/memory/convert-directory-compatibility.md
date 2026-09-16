---
name: Convert directory compatibility
description: Compatibility rules for displaying historical Quickex orders in the admin directory
---

Treat persisted Quickex JSON as versioned historical input. Normalize amount values to exact decimal strings and convert nullable optional metadata to omitted fields before validating the shared admin Order response.

**Why:** older Convert rows may contain JSON numbers and empty or null provider metadata, while current API contracts require decimal strings and reject null for optional string fields. One incompatible row can invalidate the entire paginated Orders response.

**How to apply:** perform compatibility normalization in the Quickex-to-admin adapter, including scientific-notation expansion. Test directory pages with mixed legacy/current representations and every supported provider status.