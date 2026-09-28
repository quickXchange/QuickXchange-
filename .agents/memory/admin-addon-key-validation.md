---
name: Admin add-on key validation
description: Why customer-facing Swap add-on creation needs a generated key and exact client-side validation.
---

An Admin-facing option name is not a valid machine key by default. Generate a server-compatible key from the human-readable name, keep it editable, and check the exact key boundary before submitting. Avoid relying only on an HTML `pattern`: browsers parse patterns with Unicode-aware `v` rules, where an unescaped hyphen inside a character class may invalidate the pattern and silently disable native validation.

**Why:** Production add-on creation returned a generic 400 with server logs pinpointing the key regex, despite the form's apparent pattern constraint. The failed saves left the public catalog empty.

**How to apply:** For future Admin-generated identifiers, match server constraints explicitly, show actionable errors, and verify the generated value before submitting. Never replace failed financial configuration with hardcoded customer charges.