---
name: Manual desk estimate boundaries
description: Durable arithmetic and provider-isolation rules for manual desk quotes.
---

Manual desk estimates must parse decimal rates exactly, quantize gross once in target atomic units, derive the fee from that gross, and calculate net as gross minus fee. While monetary API fields remain numbers, cap advertised target precision at eight decimals and reject values that cannot canonical round-trip within 15 significant digits.

**Why:** Independent floating-point rounding once made fee plus net exceed gross by one atomic unit, and higher-precision decimals could change between display, signed quote, and database persistence.

**How to apply:** Use the same atomic-unit result for quote signing and order persistence. Fail before order creation when precision or significance is unsupported. Keep fiat-only routes independent of the crypto catalog and map crypto-catalog failures to provider-neutral desk errors.