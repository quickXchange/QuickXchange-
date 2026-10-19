import codes from "../data/rates-currency-codes.json";

// Publication identity only. Never use these aliases to resolve executable routes.
const networkAliases: Record<string, string> = {
  ETH: "ERC20", ETHEREUM: "ERC20",
  TRON: "TRC20", TRX: "TRC20",
  BSC: "BEP20", BNBSMARTCHAIN: "BEP20",
  BINANCESMARTCHAIN: "BEP20",
  POL: "POLYGON", MATIC: "POLYGON",
  SOLANA: "SOL", SPL: "SOL",
  ARB: "ARBITRUM", ARBTM: "ARBITRUM",
  OP: "OPTIMISM", OPTM: "OPTIMISM",
  AVALANCHECCHAIN: "AVAXC",
  BITCOIN: "BTC", LIGHTNING: "LN", BTCLN: "LN",
  XRPL: "XRP", RIPPLE: "XRP", ALGORAND: "ALGO",
  BITCOINCASH: "BCH", BITCOINSV: "BSV",
  BINANCEBEACONCHAIN: "BEP2",
};
const normalize = (value: string) => value.trim().toUpperCase().replace(/[\s_-]/g, "");
const network = (value: string) => networkAliases[normalize(value)] ?? normalize(value);

// Explicit native/token identities for CSV entries that omit the network.
// An unknown chain must remain unmapped, even if the asset symbol matches.
const baseNetworks: Record<string, string> = {
  BTC: "BTC", BCH: "BCH", BSV: "BSV", ETH: "ERC20", WBTC: "ERC20",
  WETH: "ERC20", ETC: "ETC", LTC: "LTC", XRP: "XRP", XMR: "XMR",
  DOGE: "DOGE", POL: "POLYGON", DASH: "DASH", ZEC: "ZEC",
  USDP: "ERC20", USDS: "ERC20", BUSD: "ERC20", PYUSD: "ERC20", UUSD: "UTOPIA",
  XEM: "XEM", NEO: "NEO", EOS: "EOS", IOTA: "IOTA", ADA: "ADA",
  XLM: "XLM", TRX: "TRC20", WAVES: "WAVES", OMG: "ERC20", XVG: "XVG",
  ZRX: "ERC20", ICX: "ICX", PEPE: "ERC20", BTT: "BITTORRENT",
  BAT: "ERC20", ONT: "ONT", QTUM: "QTUM", LINK: "ERC20", ATOM: "ATOM",
  XTZ: "XTZ", DOT: "DOT", UNI: "ERC20", RVN: "RVN", SOL: "SOL",
  VET: "VET", ALGO: "ALGO", AVAX: "AVAXC", YFI: "ERC20", MANA: "ERC20",
  LUNA: "LUNA", NEAR: "NEAR", CRO: "CRONOS", GRAM: "TON", NOT: "TON",
  CAKE: "BEP20", APT: "APT", ARB: "ARBITRUM", OP: "OPTIMISM",
  TRUMP: "SOL", SUI: "SUI", KAS: "KAS", FIL: "FIL", AAVE: "ERC20", ICP: "ICP",
};
const variants: Record<string, string> = {
  ERC20: "ERC20", TRC20: "TRC20", BEP20: "BEP20", BEP2: "BEP2",
  ARBTM: "ARBITRUM", OPTM: "OPTIMISM", POLYGON: "POLYGON", AVAXC: "AVAXC",
  SOL: "SOL", TON: "TON", OMNI: "OMNI", NEAR: "NEAR", BASE: "BASE", LN: "LN",
};
export const XML_CRYPTO_IDENTITIES = codes.filter(c => c.type === "crypto").map(entry => {
  const symbol = entry.description.match(/\(([^()]+)\)$/)?.[1];
  if (!symbol) throw new Error(`Missing asset identity in approved XML code ${entry.code}`);
  const suffix = Object.keys(variants).find(part => entry.code.endsWith(part) &&
    entry.code !== part && entry.description.toUpperCase().includes(
      part === "ARBTM" ? "ARBITRUM" : part === "OPTM" ? "OPTIMISM" : part,
    ));
  const chain = suffix ? variants[suffix] : baseNetworks[entry.code];
  if (!chain) throw new Error(`Missing network identity for approved XML code ${entry.code}`);
  return { code: entry.code, asset: symbol, network: chain };
});
// The partner catalogue contains tens of thousands of routes. Build the fixed
// whitelist index once instead of scanning it twice for every route on every read.
const cryptoCodeIndex = new Map<string, string | null>();
for (const entry of XML_CRYPTO_IDENTITIES) {
  for (const asset of new Set([entry.asset, ...(entry.code === "GRAM" ? ["TON"] : [])])) {
    const key = `${asset}\0${entry.network}`;
    cryptoCodeIndex.set(key, cryptoCodeIndex.has(key) ? null : entry.code);
  }
}

/** Exact asset + chain lookup, restricted to the supplied crypto whitelist. */
export function automaticXmlCryptoCode(assetCode: string, networkCode: string): string | null {
  const asset = normalize(assetCode), chain = network(networkCode);
  return cryptoCodeIndex.get(`${asset}\0${chain}`) ?? null;
}

/** Existing explicit operator mappings remain authoritative; missing codes are automatic. */
export function resolveXmlCryptoCode(
  configuredCode: string | null | undefined, asset: string, chain: string,
): string | null {
  return configuredCode || automaticXmlCryptoCode(asset, chain);
}
