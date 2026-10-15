# Quickex technical support report — aff_35637

**Subject:** Affiliate JSON catalogue works, but not every listed direction is quoteable; Production connection timeouts need correlation

**Website:** https://quickchange.exchange  
**XML endpoint:** https://quickchange.exchange/api/rates.xml  
**Affiliate:** `aff_35637`  
**Direct test window:** 15 October 2026, 19:32:16–19:33:52 UTC  
**Production log window reviewed:** approximately 19:16–19:31 UTC on the same date

Hello Quickex team,

Please help confirm the full availability of JSON rates for our affiliate and investigate the specific discrepancies below.

## 1. Confirmed: the public JSON API is reachable

Read-only requests from our Replit Development workspace successfully reached:

```text
GET https://quickex.io/api/v2/pairs/all
    ?limit=1000&offset=0&referrerId=aff_35637

GET https://quickex.io/api/v2/rates/public/one
    ?referrerId=aff_35637
    &rateMode=FLOATING
    &instrumentFromCurrencyTitle=BTC
    &instrumentFromNetworkTitle=BTC
    &instrumentToCurrencyTitle=USDT
    &instrumentToNetworkTitle=TRC20
```

The catalogue reports **57,062 total directions**. We sampled the beginning, middle and end rather than downloading or quote-testing every direction.

| Catalogue offset | HTTP | Returned | Active | Inactive | Missing at least one bestChangeCurrencyName | Seconds |
|---|---:|---:|---:|---:|---:|---:|
| 0 | 200 | 1,000 | 708 | 292 | 899 | 2.215 |
| 28,000 | 200 | 1,000 | 849 | 151 | 959 | 3.351 |
| 57,000 | 200 | 62 | 57 | 5 | 38 | 4.990 |
| **Sample total** | | **2,062** | **1,614** | **448** | **1,896** | |

Missing-code counts cover all sampled rows, including inactive rows; the categories overlap. These are selected pagination windows, not a random sample or a full-catalogue audit.

## 2. Confirmed: several directions return current JSON quotes

The following requests used `referrerId=aff_35637` and `rateMode=FLOATING`.

| Exact provider direction | HTTP | Seconds |
|---|---:|---:|
| BTC / BTC → USDT / TRC20 | 200 | 0.471 |
| USDT / TRC20 → BTC / BTC | 200 | 0.446 |
| USDT / ERC20 → BTC / BTC | 200 | 1.787 |
| BNB / BEP20 → USDT / TRC20 | 200 | 0.423 |
| USDT / TRC20 → USDT / ERC20 | 200 | 0.434 |
| ETH / ETH → USDT / TRC20 | 200 | 1.294 |

Responses included `updatedAt`, `quotesWithoutNetworkFee.sellQuote` and, where captured, `finalNetworkFeeAmount`. The captured update timestamps were contemporary with the requests.

Independent Node native-fetch probes also returned HTTP 200 for BTC / BTC → USDT / TRC20:

- Floating: **570 ms**, at 19:32:41 UTC.
- Fixed: **176 ms**, at 19:32:43 UTC.

An initial ETH request using network title `ERC20` returned HTTP 422, `Pair not found [iF]`. Correcting the provider's native ETH identifier to `ETH` succeeded. We classify that initial result as an invalid identifier, **not evidence of an access block**.

## 3. Confirmed: active does not always mean quoteable

At 19:33:51 UTC, the catalogue returned:

```text
GRAM / TON → RVN / RVN
isActive: true
from bestChangeCurrencyName: GRAM
to bestChangeCurrencyName: RVN
```

However, its rate request at 19:33:04 UTC returned HTTP 422 in 0.446 seconds:

```json
{
  "status": "ERR_NO_LIQUIDITY_AVAILABLE",
  "message": "KUCOIN_PROVIDER quotes not found for pair GRAM_RVN"
}
```

The same catalogue sample marked GRAM / TON → S / Sonic active, but supplied an empty target `bestChangeCurrencyName`. We cannot safely invent an external XML currency identifier.

## 4. Production remains unreliable; cause is not yet attributed

The Production application logged these failures:

```text
2026-10-15T19:24:01.373Z
Quickex transport failed: stage=tcp_tls, code=ETIMEDOUT, elapsedMs=6001

2026-10-15T19:24:02.173Z
Quickex instrument catalog refresh failed: code=QUICKEX_NETWORK

2026-10-15T19:26:27.573Z
Quickex transport failed: stage=http, code=ETIMEDOUT, elapsedMs=29800

2026-10-15T19:29:53.073Z
Quickex transport failed: stage=http, code=ETIMEDOUT, elapsedMs=5701
```

These timeouts do not establish whether the cause is routing, egress/firewall behavior, a provider edge/IP policy, or our application's runtime delays. Logged elapsed times are application observations, not independently measured Quickex processing times.

No HTTP 401, 403 or 429 was observed in the direct diagnostic requests. That does **not** prove that the Production egress address or configured keyed traffic is accepted.

At 19:32:53 UTC, our Production Convert configuration endpoint returned HTTP 200, advertising 205 instruments and 41,820 routes with `signedOrders=true`. This is application capability metadata, **not proof that all those routes were freshly quoted**.

At 19:33:06 UTC, our public XML returned HTTP 200 with **five Manual/Swap items and zero Convert items**.

We also have a known application-side XML discovery deadline issue: `XML_DISCOVERY_TIMEOUT` is our own error, not a Quickex response. A workspace fix was prepared separately. The live deployment continued logging that error during this review. Our own database-pool/event-loop delays are also under investigation. We are not attributing those application errors to Quickex.

## 5. Please confirm or investigate

1. Is `aff_35637` fully permitted for both public JSON endpoints and both Fixed/Floating modes? Are affiliate permissions different for anonymous requests and our configured public-key traffic?
2. What does `isActive=false` mean for the sampled directions? Is it global/provider availability, an affiliate restriction, or another condition?
3. Why can a direction such as GRAM → RVN be marked active while its rate endpoint reports no liquidity? What field or endpoint should determine actual quoteability?
4. Can you provide official XML currency identifiers for supported directions with empty `bestChangeCurrencyName`, or identify which are intentionally unsupported for XML?
5. Please correlate our Production timestamps with your API/edge/WAF logs. Were requests rejected, throttled or silently dropped? If you need our Production source IP or public-key identity through a secure channel, please specify how to provide it; neither is included in this report.
6. What are the supported per-endpoint limits, catalogue pagination guarantees and recommended method to keep a large catalogue fresh? Is there an official bulk-rate endpoint?
7. What request-ID or trace header should we capture for future Production timeout investigations? No `x-request-id` or `cf-ray` was present in the successful Node sample responses.

## Scope and limitations

- Direct probes were public, unauthenticated requests carrying the affiliate query parameter, without an API-key header. We did not independently replay configured keyed requests from the Production runtime.
- We sampled 2,062 catalogue rows and several quotes; we did not certify live liquidity for all 57,062 directions.
- TLS verification remained enabled. No credentials, customer details, wallets or private financial data are included.
- No orders, deposits, payouts, configuration changes or publication were performed during this review.

**Conclusion:** Public affiliate JSON retrieval and several live quotes work. A complete account-wide block is not demonstrated, but “all directions are active and quoteable” is not supported by these results. Production-specific timeout attribution remains unresolved.
