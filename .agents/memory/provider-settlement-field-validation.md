---
name: Provider settlement field validation
description: How to handle provider-declared settlement fields at quote boundaries.
---

Provider-declared settlement field collections must fail closed as a whole. If any declared field has an unsupported type, duplicate key, malformed option, invalid conditional rule, or unsafe constraint, reject the provider quote rather than silently dropping that field.

**Why:** Silently deleting an invalid provider-required field can make the customer submit an incomplete financial order while the displayed quote appears usable.

**How to apply:** At provider quote parsing boundaries, validate the collection and every supplied known property before issuing a local signed quote ticket. Convert any parser or safety-validator failure into the provider malformed-response error.