# Task: Rebuild the rates XML export for QuickChange (v3 — final decisions)

## 1. Goal
Replace the current BestChange page with a simpler setup: `rates.xml` is generated automatically from the routes on the site. Codes and reserves live in **payment method settings**; fees and limits live in **Edit Path / Add Range**.

Test on staging first. Remove the current implementation only after the new export is confirmed working.

## 2. Endpoint
- URL: `https://[QUICKCHANGE-DOMAIN]/api/rates.xml`
- Every **active** route appears automatically if both its sending and receiving methods have a code. Creating, editing, disabling or deleting a route updates the XML with no manual step.
- `Content-Type: application/xml; charset=utf-8`, starting with `<?xml version="1.0" encoding="UTF-8"?>`.
- Root `<rates>`, one `<item>` per route, all tag names lowercase.
- **Do not output a `<floating>` tag.**

## 3. Item structure

Swap route:
```xml
<item>
  <from>USDTBEP20</from>
  <to>PPUSD</to>
  <in>1</in>
  <out>0.98</out>
  <amount>1000000</amount>
  <minamount>1000 USDT</minamount>
  <maxamount>200000 USDT</maxamount>
  <param>manual</param>
</item>
```

Convert route:
```xml
<item>
  <from>BTC</from>
  <to>USDTTRC20</to>
  <in>1</in>
  <out>(rate from Quickex API)</out>
  <amount>1000000</amount>
  <minamount>0.001 BTC</minamount>
  <maxamount>5 BTC</maxamount>
  <param>floating</param>
</item>
```

## 4. Field rules

| Tag | Rule | Source |
|---|---|---|
| `from` / `to` | Codes of the sending / receiving methods. | Code field in payment method settings |
| `in` | Always `1`. | Fixed |
| `out` | **Swap:** amount of the to currency per 1 unit of the from currency, after the route's fees. **Convert:** the rate for that pair from the Quickex API we already integrated. | Swap: route rate + Edit Path fees. Convert: Quickex API |
| `amount` | Reserve of the receiving method. **Default `1000000`.** The admin can change it any time in that payment method's settings, and every route receiving into that method updates. | Receiving payment method settings |
| `minamount` / `maxamount` | Per-exchange limits in the **from** currency, as number + space + ticker (e.g. `1000 USDT`). | Route's Edit Path / Add Range |
| `param` | Swap routes: always `manual`. Convert routes: always `floating`. | Route's function type |

## 5. Fees (Swap routes)
- Fees are set per route in **Edit Path / Add Range**, alongside min and max. Read them from there.
- Percentage fees are folded into `out`.
- If a route has a fixed fee, output it in BestChange's fee field for that purpose, so `out` stays accurate for every order size. Don't change how the site itself calculates fees.

## 6. Payment method settings (admin)
Add to each payment method:
- **Code**: dropdown restricted to `currency_codes.csv`.
- **Reserve**: number, prefilled with `1000000`, editable any time.

## 7. Code mapping
- Only codes from `currency_codes.csv`. Never invent a code.
- A route whose sending or receiving method has no code is left out and listed in the admin panel.
- **`PMUSD` and `PMEUR` (Perfect Money) are for testing only:** include them on staging, exclude them from the production XML until confirmed.

## 8. Acceptance checks
- A new active Swap route appears with `in`=1, `amount`=1000000, `param`=manual.
- A new active Convert route appears with `param`=floating and `out` from Quickex.
- Changing a reserve in payment method settings updates `amount` on all routes receiving into it.
- Editing fees, min or max in Edit Path updates the XML.
- Swap `out` matches what a client actually gets on the site for the same route.
- No `<floating>` tag anywhere.
- Disabled or deleted routes disappear; Perfect Money routes absent in production.
- Output is well-formed XML.
