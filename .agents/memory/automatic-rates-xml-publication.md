---
name: Automatic rates XML boundaries
description: User-confirmed replacement scope, authoritative specification and financial boundaries.
---

For Convert XML, Quickex's official V2 documentation permits an uppercase instrument slug when `bestChangeCurrencyName` is empty. Prefer the explicit provider code, reject ambiguous or invalid identifiers, and do not apply this fallback to Swap's approved currency-code whitelist.

**Why:** The API can legitimately omit aggregator names on active affiliate pairs. Missing names alone do not prove a blocked route; the provider explicitly documents the slug fallback.

**How to apply:** Use the same provider-code resolution for eligibility, collision checks, output and persisted method metadata. A slug fallback is a generic provider feed identifier, not a guarantee that a particular external aggregator recognizes it.

Convert XML limits come from the live quote's `generalMinAmount` and `generalMaxAmount`. Catalogue bounds are only request hints and may be zero or empty. Publication freshness starts at the provider's Unix-millisecond `updatedAt`, not at HTTP receipt.

**Why:** Live testing confirmed a valid affiliate pair whose catalogue bounds were both zero while its quote returned executable limits. Resetting freshness on receipt could also advertise an old upstream rate as current.

**How to apply:** Reject absent or inconsistent live limits. Treat missing, expired or future provider timestamps as temporary failures; retain prior successful data for recovery without renewing its validity. Do not modify customer quotes, affiliate attribution or order calculations to construct XML.

Publication-contract changes must isolate older snapshots until fresh provider proof satisfies the new rules.

**Why:** Earlier Convert snapshots had catalogue bounds and receipt-time freshness, so loading them under the corrected rules would still advertise unverified legacy data.

**How to apply:** Version the XML publication cache scope without deleting historical cache or financial records. A cold refresh is safer than labeling an incompatible snapshot fresh.

Provider throughput, not the size of its catalog, bounds how many directions can
be kept fresh. Prioritize existing near-expiry publications; leave cold
directions pending rather than lengthening validity to claim full coverage.

**Why:** The partner catalog contained tens of thousands of pairs, while rates
were fetched individually under provider pacing. A full-matrix refresh could
take far longer than a rate's freshness window.

**How to apply:** Keep publication validity per row, independent of batch
completion. Share the executable-route authority and expose pending directions
honestly; batching must not silently become a total catalog cap.

The user explicitly chose to remove the previous XML system first, then rebuild solely from the newly supplied rates prompt and currency-code CSV. Do not restore the legacy BestChange feed, manual XML direction store, legacy fallback or dynamic active-order percentage adjustment.

**Why:** The user rejected retaining the previous implementation while staging a replacement, and confirmed removal before rebuilding.

**How to apply:** Future XML work must extend the one automatic publication system, not reintroduce parallel pricing or legacy compatibility controls. Retain historical database migrations; remove only obsolete XML-specific configuration, not shared financial settings.

Swap publication follows its existing quote service. Convert XML follows the partner JSON migration instructions supplied on 2026-10-13, not customer quote tickets or local XML reserves. Customer pricing, provider quotes, order creation, deposits and settlement remain independent of XML output. Swap codes come only from the approved whitelist; unavailable publication values must not be invented.

**Why:** The supplied requirements make the current financial architecture authoritative and prohibit invented rates, codes and limits.

**How to apply:** Preserve shared payment-method reserves and operator-selected fiat codes for Swap. Range-specific Swap fees use the user's chosen one-item fee-step representation. Convert XML uses provider-owned codes, reserves and limits without local Admin assignments.

Crypto XML codes default automatically from the supplied catalogue using the exact asset and network identity, without requiring Admin assignments. Existing explicit mappings remain authoritative; fiat/payment-method codes still require operator selection.

**Why:** The user explicitly requested embedded automatic crypto/network codes, including USDT TRC20, so configured fiat-to-crypto directions can publish without manual crypto configuration.

**How to apply:** Use approved CSV codes for Swap and preserve chain distinctions. Unknown or ambiguous combinations stay unmapped; do not invent pricing or replace fiat mappings. Convert's partner JSON identities are now a separate authoritative publication source.

Quote refresh must not make an HTTP XML request wait for the entire provider route matrix. Share a bounded-concurrency refresh and retain previously successful publication rates during slow or failed refreshes.

**Why:** Automatic crypto mappings expose many executable provider candidates; waiting for every quote caused the feed request to exceed two minutes.

**How to apply:** Preserve canonical Swap quote calls and provider/configuration fencing. Bound response wait, not the set of directions eventually checked. Persist last successful public items across process restarts, identify retained rates in response headers, and never manufacture rates for directions without a successful quote. Retained XML is advisory only; customer orders still require live pricing.

Judge Convert XML freshness by each retained provider quote's timestamp, not only by the completion time of the full route refresh.

**Why:** In a slow, bounded-concurrency refresh, the first route may be expired by the time the last route completes; a successful batch does not renew those earlier quotes.

**How to apply:** Keep expired successful rows available as last-successful with explicit stale response metadata until provider recovery, but never identify them as live. Continue to fence removed routes and credential changes; customer Convert quotes must still come from the live provider.

The user requested removal of the dedicated Rates XML section from Admin while keeping `/api/rates.xml` operating automatically.

**Why:** The user explicitly asked to delete the Admin section and fix intermittent disappearing rates caused by slow requests.

**How to apply:** Do not restore the standalone Admin page/menu. Preserve saved Swap mappings and method-level controls. Failed refreshes retain good rates; changed applicable configuration or intentionally disabled routes must not reuse an obsolete publication. Local Swap settings must not become Convert XML pricing or reserves.

The user requires the entire supplied currency-code catalogue to be available in the Admin XML method selectors, not a partial import or silently limited list.

**Why:** The user explicitly repeated that the full file must be present in the payment-method XML controls after entries were hidden.

**How to apply:** Verify the displayed option set against the complete applicable CSV entries, including entries at the end of the file. Retain fiat/crypto type validation; search must not silently truncate matching results.

Perfect Money USD/EUR is staging-only until explicit future production confirmation. Do not publish or change Production just because the rebuild is complete.

**Why:** The supplied specification requires a staged rollout and the user has not approved publishing.

**How to apply:** Separate Workspace verification from any subsequent Production migration, configuration or publication work.

Convert XML uses the same platform-owned affiliate identity on every full pair-catalogue and public rate request. Publish provider base/quote values without network fee; represent its final network fee separately, using its numeric limits and reserves. Never create an exchange or reuse an XML value for customer pricing.

**Why:** The user supplied Quickex's public JSON migration instructions and requested automatic live Convert XML instead of manual XML configuration. Quickex already applies partner fees; local recalculation would double-charge or misrepresent them.

**How to apply:** Keep the adapter publication-only. Discover the complete paginated affiliate catalogue, skip inactive/malformed/unmapped/ambiguous/self directions, and pace requests against provider limits. The real catalogue is much larger than the PDF's example; discovery and quote population must stay background work, not an HTTP dependency. Preserve original JSON numeric tokens rather than rounding them through JavaScript floating point.

Retained publication data is diagnostic/recovery data, not permission to publish expired rates. Public Convert XML must respect current verified Convert credentials and Admin asset/network capabilities.

**Why:** The user explicitly requires fresh, executable XML directions and preservation of cached data without advertising stale rates as live.

**How to apply:** Keep historical snapshots through temporary outages, but exclude expired or non-executable entries from public output. Check freshness per entry, not merely batch completion or a response-wide warning. Use the shared capability resolver with affiliate pair candidates, not the separate popular-pair UI catalog. If no fresh directions remain, report temporary unavailability rather than label an empty or stale feed fresh.

Apply short discovery deadlines only to HTTP response waits, never to the background XML refresh. XML directions come from the affiliate `/pairs/all` catalog, not `/pairs/public`.

**Why:** The provider migration document distinguishes the affiliate catalog from the popular-pair list. Depending on the latter and calling the HTTP reader from a worker caused repeated timeout reports even when affiliate quotes were reachable.

**How to apply:** Warm affiliate data in the background under provider/database timeouts. Public reads recheck runtime credentials and local capabilities without remote catalog refresh or UI default-pair lookup. Never cache completed local route permissions or extend provider-rate validity.
