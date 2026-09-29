---
name: Quickex receive-target quoting
description: Provider semantics and precision boundaries for authoritative reverse Convert quotes.
---

Quickex V2 public quote requests accept the target currency as `claimedDepositAmountCurrency` with a desired target `claimedDepositAmount` in both Floating and Fixed modes. A verified BTC-to-USDT route returned the requested target as `amountToGet` and the required source as `amountToGive` (and also as `claimedDepositAmount`). The target-currency request does not make the latter field a target amount.

**Why:** Numeric inversion of a displayed rate would not preserve provider pricing or limits. The provider can reject a low target with `data.details.expected` expressed in target currency even when `data.details.value` is expressed in source currency; its default error message discards that useful minimum. JavaScript number conversion can also drop provider decimal digits before an order is created.

**How to apply:** For reverse Convert quotes, use the provider's returned send and receive amounts, preserve the signed provider quote, and ensure the displayed/signed source amount cannot differ from the eventual order amount. Validate any error-bound amount before showing it with the target currency. If source and target share a ticker across networks, the currency-only amount selector is ambiguous: fail closed unless the provider's response proves the target amount was honored. Never change the forward Swap path to emulate this provider feature.