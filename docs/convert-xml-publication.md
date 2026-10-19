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

Verified suites:

- Partner JSON/XML mapping: 32 passing.
- Rolling refresh, affiliate candidates and slow-discovery regression: 6 passing.
- Existing automatic/Swap XML formatting: 20 passing.
- Discovery single-flight and response bounds: 4 passing.
- Isolated persistence/freshness and API authorization: 2 passing.
- API TypeScript check and production build: passing.

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
