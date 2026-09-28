---
name: Theme-safe brand logos
description: Preserve official logo artwork inside the platform-wide circular container contract.
---

Payment-method, bank, crypto, network, and fiat logo containers must be perfectly circular with restrained theme-safe treatment. Payment artwork keeps its original colors and centered proportions; never invert, grayscale, tint, stretch, or crop important marks. Resolve sources in this order: Admin-uploaded URL, official stored/bundled asset, Brandfetch, then a circular initial/symbol fallback. Preserve verified exceptions for unsuitable uploads.

**Why:** The user explicitly chose one consistent circular avatar language and edge treatment across the platform while requiring authentic artwork and uploaded catalog branding to remain authoritative. A former neutral white backing caused unwanted visible mats, especially in Light Mode; the later explicit preference is transparent payment/bank wrappers. Brandfetch Logo API also redirects command-line probes to its documentation as automated-traffic protection even when browser hotlinking works.

**How to apply:** Make Payment Method artwork changes in the cross-artifact shared renderer rather than page-specific CSS or curated brand scale lists. Wrappers may choose the standardized square size and attach a smaller bottom-right badge. Preserve source bytes: in-memory same-origin canvas display processing may remove connected near-white edge padding, but must fail closed when canvas access is unavailable. Circular clipping hides exterior corners of square fallback icons without changing the stored image. Treat Brandfetch as browser-hotlink-only: shell redirects do not prove browser failure.

Known exception: an opaque BBVA catalog upload has a navy rectangle baked into every corner. Prefer a transparent blue mark in Light Mode and a transparent white mark in Dark Mode through the shared order-logo source selection, rather than trying to hide its pixels with CSS or changing the configured upload.

**Why:** A circular container clips only the external square boundary; it cannot remove the opaque square visible inside a contain-fitted image. The white variant uses the same BBVA mark silhouette and transparency, not a CSS filter.

**How to apply:** Preserve other uploaded logos as authoritative unless their intrinsic artwork is independently found unsuitable. Report the retained opaque upload when explaining the BBVA exception.

Payment Method artwork across the Telegram Mini App and website may be optically enlarged and recentered from measured transparent-pixel bounds inside the shared circular renderer. Keep contain fitting and uniform scaling; never alter uploaded files.

**Why:** Arbitrary uploaded SVG/PNG logos with transparent internal whitespace looked tiny in Orders despite identically sized circles. Browser canvas reads of remote images may be blocked by CORS, so measurement must fail safely to centered containment. The user explicitly confirmed the optical sizing and compact site-icon treatment looked much better and asked that sizing be kept.

**How to apply:** Reuse the renderer across Orders, details, and Swap; cache measurements by image URL, measure only already-loaded artwork at a small resolution, and keep unreadable or fully transparent sources visible at a conservative scale. Very wide wordmarks cannot fill a small circle while remaining whole: prefer a verified square favicon when one exists. Retain verified theme-specific source exceptions.

When fitting artwork, an opaque or rounded-square brand background is not transparent padding; use its contrasting central mark to choose a safe enlargement while keeping the background circularly clipped. A wordmark cannot fill both axes of a small circle without either cropping or distortion. Test the empty-source render before catalog data loads, not only populated logo rows.

**Why:** Some configured Payment Method art has a wide mark on a filled square, while another is a transparent wide wordmark. Alpha-only fitting treats them as the same shape incorrectly. The Mini App's Exchange route also crashed on first load after a compact-icon guard assumed an image source existed.

**How to apply:** Inspect the live catalog's available artwork in both themes and multiple mobile sizes; preserve the whole visible mark and use icon fallbacks only when the brand identity matches. In Dark Mode, sampled low-luminance transparent marks need a neutral light *circular* backing to remain legible; a glow alone proved insufficient. Other marks retain their transparent surface. Treat absent or failed sources as a normal render state.