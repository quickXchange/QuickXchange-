---
name: Customer language scope
description: Supported languages and shared control requirements for the Website and Telegram Mini App.
---
Keep only English, French, German, Russian, Spanish, Korean and Ukrainian. Do not add Arabic or RTL.

**Why:** The user explicitly narrowed the multilingual audit to these seven languages and approved shared Admin language controls.

**How to apply:** Use the existing translation system and shared Admin controls for both the Website and Telegram Mini App; preserve canonical financial identifiers and values.

Clerk's native translated resources can lag its English resource and have incompatible interpolation tokens.

**Why:** Older native authentication translations included or omitted template variables compared with the current English source.

**How to apply:** Validate translation completeness and exact interpolation-token parity against the current English resource before adopting updated authentication locales.

Do not re-register an existing translation key as English copy or use a localized label as navigation identity.

**Why:** Reprocessing translated metadata created key-to-key catalog entries and raw keys in navigation; translated labels also made label-based menu filtering unreliable.

**How to apply:** Preserve stable metadata identities and canonical source defaults, translate at display boundaries, and reject unresolved key-to-key catalog values during regression checks.

Structural providers that mount the localization context must not depend on that same context, and root error screens need a context-independent fallback through the same dictionaries.

**Why:** Broad copy migrations injected a mandatory localization hook above its own provider and caused blank root screens, obscuring the original error.

**How to apply:** Exclude bootstrap/provider owners from automatic hook injection; localize their visible leaf components without changing provider order.
