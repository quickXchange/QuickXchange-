---
name: Theme-safe brand logos
description: Preserve official logo artwork inside the platform-wide circular container contract.
---

Payment-method, bank, crypto, network, and fiat logo containers must be perfectly circular with a subtle one-pixel boundary and restrained theme-safe surface treatment. Crypto coins and fiat flags fill the circle with cover fitting; payment and bank artwork targets a 90–95% internal content box with centered contain fitting. Payment and bank wrappers are transparent in both themes; never add a white or dark backing behind transparent artwork. Never invert, grayscale, tint, recolor, or stretch artwork. Resolve sources in this order: Admin-uploaded URL, official stored/bundled asset, Brandfetch, then a circular initial/symbol fallback.

**Why:** The user explicitly chose one consistent circular avatar language and edge treatment across the platform while requiring authentic artwork and uploaded catalog branding to remain authoritative. A former neutral white backing caused unwanted visible mats, especially in Light Mode; the later explicit preference is transparent payment/bank wrappers. Brandfetch Logo API also redirects command-line probes to its documentation as automated-traffic protection even when browser hotlinking works.

**How to apply:** Make artwork geometry changes through the shared avatar renderer, not page-specific image selectors; context wrappers may choose among shared sizes. Let intrinsic aspect ratio choose icon, wordmark, or tall fit. Apply curated optical scales by recognized brand, including Admin-uploaded sources, only after visual verification shows the scale preserves meaningful artwork; unknown uploads retain unscaled contain fitting. Keep currency badges smaller and attached at bottom-right. Leave source files and intrinsic artwork backgrounds unchanged: circular clipping can hide square corners, but an opaque brand-colored or white background baked into image pixels cannot safely be made transparent by CSS without changing the artwork. Report these separately. Treat Brandfetch as browser-hotlink-only: verify it through a rendered image with positive natural dimensions, use explicit domain/crypto routes with fallback/404, and never infer failure from a shell redirect alone.

Known exception: an opaque BBVA catalog upload has a navy rectangle baked into every corner. Prefer a transparent blue mark in Light Mode and a transparent white mark in Dark Mode through the shared order-logo source selection, rather than trying to hide its pixels with CSS or changing the configured upload.

**Why:** A circular container clips only the external square boundary; it cannot remove the opaque square visible inside a contain-fitted image. The white variant uses the same BBVA mark silhouette and transparency, not a CSS filter.

**How to apply:** Preserve other uploaded logos as authoritative unless their intrinsic artwork is independently found unsuitable. Report the retained opaque upload when explaining the BBVA exception.

For the Telegram Mini App, Payment Method artwork may be optically enlarged and centered from its measured transparent-pixel bounds inside the shared circular renderer. This is a presentation-only exception to leaving unknown uploads unscaled; keep `object-fit: contain` and uniform scaling, and never alter uploaded files.

**Why:** Arbitrary uploaded SVG/PNG logos with transparent internal whitespace looked tiny in Orders despite identically sized circles. Browser canvas reads of remote images may be blocked by CORS, so measurement must fail safely to centered containment. The user explicitly confirmed the optical sizing and compact site-icon treatment looked much better and asked that sizing be kept.

**How to apply:** Reuse the renderer across Orders, details, and Swap; cache measurements by image URL, measure only already-loaded artwork at a small resolution, and keep unreadable or fully transparent sources visible at a conservative scale in Light and Dark mode. Very wide wordmarks cannot fill a small circle while remaining whole: prefer a verified square favicon from the existing brand-domain fallback when one exists, rather than cropping or stretching the uploaded wordmark. Retain theme-specific source exceptions where a favicon would compromise contrast.

When fitting artwork, an opaque or rounded-square brand background is not transparent padding; use its contrasting central mark to choose a safe enlargement while keeping the background circularly clipped. A wordmark cannot fill both axes of a small circle without either cropping or distortion. Test the empty-source render before catalog data loads, not only populated logo rows.

**Why:** Some configured Payment Method art has a wide mark on a filled square, while another is a transparent wide wordmark. Alpha-only fitting treats them as the same shape incorrectly. The Mini App's Exchange route also crashed on first load after a compact-icon guard assumed an image source existed.

**How to apply:** Inspect the live catalog's available artwork in both themes and multiple mobile sizes; preserve the whole visible mark and use icon fallbacks only when the brand identity matches. Treat absent or failed sources as a normal render state, with tests covering the initial loading frame.