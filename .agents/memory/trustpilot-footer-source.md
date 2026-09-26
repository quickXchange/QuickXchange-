---
name: Trustpilot footer source
description: How to preserve the existing Trustpilot identity across the footer and Partner Logos when no review-specific record exists.
---

Use an explicitly configured Feedback / Trust entry first. If none exists, use the public review URL setting when available; when that setting is empty, use the published Trustpilot Partner Logo's existing link as the fallback. Keep the original Partner Logo record and uploaded image intact; do not invent a new review URL. The public footer may render Trustpilot with a theme-legible green mark and wordmark rather than the uploaded image, without altering the original asset.

**Why:** The existing development publication had a linked Trustpilot Partner Logo but no Feedback / Trust entry and no public review URL setting. A footer sourced only from review entries would silently omit the existing link. The uploaded raster's wordmark was dark even in Dark Mode; recoloring a dark raster with CSS does not reliably preserve its background.

**How to apply:** When revising footer trust data sources or migrating review settings, check both locations and avoid displaying duplicate fallback entries if a configured Trustpilot item exists. Recognize the review destination by its trusted domain as well as its label, since operator labels may contain typos; preserve the saved record even if the public footer uses an accessible green presentation.