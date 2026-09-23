---
name: Trustpilot footer source
description: How to preserve the existing Trustpilot identity across the footer and Partner Logos when no review-specific record exists.
---

Use an explicitly configured Feedback / Trust entry first. If none exists, use the public review URL setting when available; when that setting is empty, use the published Trustpilot Partner Logo's existing link and image as the fallback. Keep the original Partner Logo record intact and do not invent a new Trustpilot URL or replace its image.

**Why:** The existing development publication had a linked Trustpilot Partner Logo but no Feedback / Trust entry and no public review URL setting. A footer sourced only from review entries would silently omit the existing link.

**How to apply:** When revising footer trust data sources or migrating review settings, check both locations and avoid displaying duplicate fallback entries if a configured Trustpilot item exists.