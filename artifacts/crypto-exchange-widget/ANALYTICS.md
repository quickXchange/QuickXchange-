# Exchange funnel analytics

Replit Project Analytics automatically records pageviews after analytics is enabled and the app is published. The app adds the following privacy-safe custom events:

| Description | Event name |
| --- | --- |
| A visitor selects Start Exchange or Get Started | `landing_action_clicked` |
| A visitor changes between Swap and Convert | `exchange_mode_changed` |
| A signed quote is successfully shown | `quote_displayed` |
| A quote request fails | `quote_failed` |
| An exchange order is successfully created | `order_created` |

## Event dimensions

- `landing_action_clicked`: `action` (`start_exchange` or `get_started`) and `mode` (`swap` or `convert`)
- `exchange_mode_changed`: `from_mode` and `to_mode`
- `quote_displayed` and `quote_failed`: `mode`; Convert also includes `rate_type` (`floating` or `fixed`)
- `order_created`: `mode`; Convert also includes `rate_type`

No event includes entered amounts, asset selections, wallet addresses, memos, emails, names, notes, quote IDs, order IDs, tracking tokens, error messages, or other personal or financial content.

## Useful funnels after publishing

Use the `/` pageview as the landing step, then compare:

1. **Landing to quote:** `/` pageview → `landing_action_clicked` (split by `action` and `mode`) → `quote_displayed` (split by `mode`)
2. **Quote to order:** `quote_displayed` (split by `mode`) → `order_created` (split by `mode`)
3. **Mode choice:** `/` pageview → `exchange_mode_changed` (split by `to_mode`) → `quote_displayed` → `order_created`
4. **Quote reliability:** compare `quote_displayed` with `quote_failed`, split by `mode` and, for Convert, `rate_type`

Enable analytics in Publishing settings and publish or republish the app before expecting these events. Development and unpublished sessions safely record nothing.