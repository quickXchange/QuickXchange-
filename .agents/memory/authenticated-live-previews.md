---
name: Authenticated live previews
description: Security and media rules for rendering protected drafts through real public routes in an iframe.
---

Treat a same-origin public-route preview iframe as a read-only renderer, not as an independently authenticated Admin client. Fetch protected draft media in the authenticated parent and pass blob URLs with preview state. Keep the iframe covered until it acknowledges that draft state, theme, and interaction guards are active.

**Why:** Clerk state inside the iframe can appear signed out even while the parent is an authenticated owner. Direct Admin media URLs can therefore fail, and exposing the frame before guards activate leaves a short window for real page actions.

**How to apply:** For Site Content previews, source unpublished page media, partner logos, and footer icons through parent-authenticated requests. Require an applied/locked acknowledgement before removing the loading overlay, and suppress consequential iframe interactions.