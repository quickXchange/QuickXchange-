---
name: Signed object upload headers
description: Runtime constraint for server-side uploads to signed object-storage URLs.
---

When uploading a Buffer to a signed object-storage URL with Node's fetch implementation, set the media type but let the runtime calculate `Content-Length`.

**Why:** Manually supplying `Content-Length` caused the request to fail before transfer with `UND_ERR_INVALID_ARG: invalid content-length header`, even though the byte count was correct.

**How to apply:** Use the signed URL with `PUT`, a `Content-Type` header, and the Buffer body. Do not add `Content-Length`; add a focused test that asserts it remains absent.