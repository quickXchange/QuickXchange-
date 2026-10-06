import reference from "../data/bestchange-reference.json";

type IdentifiedOption = {
  id: string;
  kind: "fiat-payment-method" | "crypto-network";
  assetCode: string;
  routeNetwork: string;
};

// Reviewed exact identities only. Do not interpret a bank name as a SEPA
// transfer, confuse a token with a native coin, or merge networks with
// different BestChange codes. Operators can override these in their settings.
const fiatCodes: Record<string, Record<string, string>> = {
  EUR: {
    paypal: "PPEUR", volet: "ADVCEUR", wise: "WISEEUR",
    "revolut-eur": "REVBEUR", skrill: "SKLEUR", neteller: "NTLREUR",
    paysera: "PSREUR", capitalist: "CPTSEUR",
    "sepa-instant": "SEPAEUR", "sepa-transfer": "SEPAEUR",
  },
  USD: {
    paypal: "PPUSD", volet: "ADVCUSD", wise: "WISEUSD",
    "revolut-usd": "REVBUSD", skrill: "SKLUSD", neteller: "NTLRUSD",
    capitalist: "CPTSUSD", zelle: "ZELLEUSD",
  },
  GBP: { wise: "WISEGBP" },
};

const cryptoCodes: Record<string, string> = {
  "BTC|Bitcoin": "BTC", "ETH|Ethereum": "ETH",
  "BNB|BEP20": "BNBBEP20", "TRX|TRC20": "TRX", "POL|POLYGON": "POL",
  "LTC|LTC": "LTC", "DOT|DOT": "DOT", "TON|TON": "TON",
  "XLM|XLM": "XLM", "XMR|Monero": "XMR", "XRP|Ripple": "XRP",
  "USDT|ERC20": "USDTERC20", "USDT|TRC20": "USDTTRC20",
  "USDT|BEP20": "USDTBEP20", "USDT|POLYGON": "USDTPOLYGON",
  "USDT|SPL": "USDTSOL", "USDT|TON": "USDTTON",
  "USDC|ERC20": "USDCERC20", "USDC|TRC20": "USDCTRC20",
  "USDC|BEP20": "USDCBEP20", "USDC|POLYGON": "USDCPOLYGON",
  "USDC|SPL": "USDCSOL",
};
const officialCodes = new Set(reference.currencyCodes.map(item => item.code));

export function reviewedBestchangeCode(option: IdentifiedOption): string {
  let code: string | undefined;
  if (option.kind === "crypto-network") {
    code = cryptoCodes[`${option.assetCode}|${option.routeNetwork}`];
  } else {
    const parts = option.id.split(":");
    if (parts.length !== 3 || parts[0] !== "fiat") return "";
    code = fiatCodes[option.assetCode]?.[parts[2]];
  }
  return code && officialCodes.has(code) ? code : "";
}
