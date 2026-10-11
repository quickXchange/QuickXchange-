---
name: Automatic rates XML boundaries
description: User-confirmed replacement scope, authoritative specification and financial boundaries.
---

The user explicitly chose to remove the previous XML system first, then rebuild solely from the newly supplied rates prompt and currency-code CSV. Do not restore the legacy BestChange feed, manual XML direction store, legacy fallback or dynamic active-order percentage adjustment.

**Why:** The user rejected retaining the previous implementation while staging a replacement, and confirmed removal before rebuilding.

**How to apply:** Future XML work must extend the one automatic publication system, not reintroduce parallel pricing or legacy compatibility controls. Retain historical database migrations; remove only obsolete XML-specific configuration, not shared financial settings.

Publication follows existing Swap and Convert quote services. Customer pricing, provider quotes, order creation, deposits and settlement must remain independent of XML output. Codes come only from the supplied approved whitelist; missing mappings and unavailable executable quotes stay explicitly pending rather than being invented.

**Why:** The supplied requirements make the current financial architecture authoritative and prohibit invented rates, codes and limits.

**How to apply:** Treat XML settings as publication metadata only. Preserve shared payment-method reserves, and require operator selection of appropriate method codes. Range-specific fees use the user's chosen one-item fee-step representation.

Perfect Money USD/EUR is staging-only until explicit future production confirmation. Do not publish or change Production just because the rebuild is complete.

**Why:** The supplied specification requires a staged rollout and the user has not approved publishing.

**How to apply:** Separate Workspace verification from any subsequent Production migration, configuration or publication work.
