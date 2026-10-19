# Quickex Convert XML publication

Public endpoint: `/api/rates.xml` on the verified published domain
`https://quickchange.exchange`.

## Provider contract

The supplied Quickex migration PDF makes `/api/v2/pairs/all` with the
platform-owned affiliate ID the XML direction authority. Paginate the complete
catalogue and request `/api/v2/rates/public/one` with the same affiliate identity.
Do not gate this feed on `/pairs/public`, which is a separate popular-pair
catalogue and may be slow or independently rate-limited.

XML uses provider base/quote values, reserves, live quote limits and a separate
network fee. Provider decimal precision is retained. No customer exchange is
created while publishing XML.

## Availability and safety

- One bounded background refresh loads affiliate pairs and quotes.
- Reuse the existing Convert credential and asset/network capability resolver
  for affiliate candidates; preserve current Admin restrictions.
- The background worker must not call the HTTP publication reader or inherit
  its three-second response deadline.
- HTTP reads recheck runtime credentials and current local capabilities, using
  cached instrument metadata and already-quoted affiliate directions. They do
  not fetch a remote pair catalogue or load customer UI default-pair settings.
- Freshness uses the provider's `updatedAt`, never receipt time. Expired,
  future-dated, disabled or unverified rates are excluded.
- Keep prior successful publication records for recovery. A provider outage
  does not permit advertising expired quotes as live.
- Swap publication remains independent and unchanged.

## Full-catalogue coverage

The 256-direction batch is a work limit, not a catalogue limit. Each eligible
direction must eventually be attempted, including later source currencies.
Previously, due existing rows always sorted before unquoted rows. Once renewal
work filled a batch, the rest of the catalogue could remain pending forever.

The scheduler now reserves at least a quarter of a saturated batch for
unquoted/expired directions, rotates source currencies, and remembers actual
dispatch order so retries do not monopolize exploration. Remaining capacity
renews valid rows oldest-first. Single-flight, concurrency, provider pacing,
429 cooldown, current capability checks and provider-time expiry still apply.
The background heartbeat no longer adds a 30-second idle gap between batches.

This does **not** promise every catalogue direction is simultaneously live.
Quickex's current Rates API V2 documentation specifies one rate per request:
120 requests/minute without a key, 600 with a standard key, and 3,000 with an
enterprise key. The XML client conservatively paces standard-key rate reads at
480/minute to retain headroom. At five-minute validity that bounds simultaneous
coverage to fewer than 2,400 quotes, before errors, latency and older provider
timestamps. The previously observed 57,062-pair catalogue would require more
than 11,412 successful fresh quotes/minute to maintain in full, if every pair
were locally executable and unambiguous. Even the documented enterprise limit
alone is insufficient for that full matrix.

To publish that entire matrix concurrently without stale data, Quickex must
supply a bulk live-rate feed or explicitly authorize sufficient throughput.
Do not infer cross-rates, stretch validity, bypass Admin route restrictions,
or create orders to fill missing XML entries.

Reference: https://quickex.io/docs/rates-api-v2/

## Diagnosis and verification, 2026-10-19

The previous worker called the HTTP reader, producing repeated
`XML_DISCOVERY_TIMEOUT` messages. Both refresh and public reads also depended on
the customer UI's separate popular-pair discovery. These dependencies could
exclude usable affiliate rates even when a direct affiliate rate request
succeeded. Production logs additionally showed real DNS/TLS/HTTP timeouts and
large event-loop delays; this patch does not claim to eliminate every upstream
or hosting failure.

After the fix, the routed Development endpoint returned HTTP 200 with 156
fresh Convert items. This is an observed snapshot, not a fixed coverage promise.
Provider throughput and availability determine how many directions can remain
fresh at once.

Original timeout-fix verification:

- Partner JSON/XML mapping: 32 passing.
- Rolling refresh, affiliate candidates and slow-discovery regression: 6 passing.
- Existing automatic/Swap XML formatting: 20 passing.
- Discovery single-flight and response bounds: 4 passing.
- Isolated persistence/freshness and API authorization: 2 passing.
- API TypeScript check and production build: passing.

Full-catalogue scheduling regression verification:

- Scheduler coverage and fairness: 3 passing.
- Rolling refresh and expiry, including saturated renewal coverage: 7 passing.
- Partner JSON/XML mapping: 32 passing.
- Existing automatic/Swap XML: 20 passing.
- Discovery single-flight and response bounds: 4 passing.
- API TypeScript check and production build: passing.

The routed Development endpoint subsequently returned HTTP 200 with 222 fresh
Convert items spanning 180 distinct XML source codes. This demonstrates source
rotation beyond the catalogue prefix, not simultaneous full-matrix coverage.
An independent read-only first-page request confirmed the affiliate catalogue
still reports 57,062 pairs. Cold startup briefly returned HTTP 503 while the
complete paginated catalogue and credential readiness were warming; no expired
rate was substituted during that interval.

## Production rollout

Publish the tested API source through the existing project publishing flow.
No schema migration, price change, credential rotation, financial-data edit or
DNS change is required by this patch. Allow the initial paginated background
refresh to complete, then verify HTTP status, `X-XML-Rate-Source`,
`X-XML-Exported-Count`, and actual Convert `<item>` elements containing
`<param>floating, language</param>`.

Development verification is not proof that Production has received the code.
At the final pre-publication check, Production returned one Swap item and zero
Convert items. No publishing was performed by the agent.
