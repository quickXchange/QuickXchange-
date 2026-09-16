---
name: Public image verification
description: Security boundary for privately uploaded images that later become publicly servable.
---

Privately uploaded raster images must pass a complete, resource-bounded decode before they can be published or served publicly. Content-Type metadata, file extensions, and magic-byte/header parsing are insufficient.

Uploaded SVGs must remain vector content, but the original bytes are not publishable. Reject malformed XML, declarations outside the prolog, DTDs, entities, active elements, event handlers, scripts, and external references with a real XML validator; then rebuild from an explicit element/attribute allowlist and serve only the reconstructed bytes.

**Why:** Direct-upload metadata can be forged, structurally plausible raster headers can wrap truncated or arbitrary payloads, and apparently visual SVG markup can carry active or external content. Invalid content must fail as a typed client error rather than entering a public image path.

**How to apply:** For rasters, match the decoder-reported format to the declared allowlisted MIME type, cap bytes/dimensions/pixels/pages, and force full decoding. For SVG, validate XML before allowlist reconstruction, verify the sanitized vector is renderable, and never serve the original upload. Map known-invalid content separately from operational storage failures.