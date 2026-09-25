import { decodeBitcoinMainnetAddress } from "./blockchain-monitoring/bitcoin";
import { normalizeTronAddress } from "./blockchain-monitoring/tron";

type ManualNetwork = {
  id: string;
  networkCode: string;
  networkName: string;
  networkFamily: string;
};

export type RefundFieldsInput = {
  refundAddress?: string | null;
  refundMemo?: string | null;
};

/** Canonicalize optional refund details at the API boundary. */
export function normalizeRefundFields(input: RefundFieldsInput): {
  refundAddress?: string;
  refundMemo?: string;
} {
  const refundAddress = typeof input.refundAddress === "string" ? input.refundAddress.trim() : "";
  const refundMemo = typeof input.refundMemo === "string" ? input.refundMemo.trim() : "";
  return {
    refundAddress: refundAddress || undefined,
    refundMemo: refundAddress && refundMemo ? refundMemo : undefined,
  };
}

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";

function networkKeys(network: ManualNetwork): string {
  return [
    network.id,
    network.networkCode,
    network.networkName,
    network.networkFamily,
  ].join(" ").toUpperCase();
}

export function isSyntacticallyValidManualWalletAddress(
  network: ManualNetwork,
  rawAddress: string,
): boolean {
  const address = rawAddress.trim();
  if (!address || address.length > 512 || /\s/.test(address)) return false;
  const keys = networkKeys(network);

  // BNB is the existing canonical BNB Smart Chain route; do not derive
  // address syntax from WhiteBIT's separately selected network alias.
  if (network.networkCode.trim().toUpperCase() === "BNB" ||
    /(ERC20|ETHEREUM|BEP20|BNB SMART|POLYGON|ARBITRUM|BASE|AVAXC|AVALANCHE C)/.test(keys)) {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }
  if (/(TRC20|TRON)/.test(keys)) {
    return Boolean(normalizeTronAddress(address));
  }
  if (/(SOLANA|\bSPL\b|\bSOL\b)/.test(keys)) {
    return new RegExp(`^${BASE58}{32,44}$`).test(address);
  }
  if (/(XRPL|XRP LEDGER|RIPPLE|\bXRP\b)/.test(keys)) {
    return new RegExp(`^r${BASE58}{24,34}$`).test(address);
  }
  if (/(STELLAR|\bXLM\b)/.test(keys)) {
    return /^G[A-Z2-7]{55}$/.test(address);
  }
  if (/(TON|OPEN NETWORK)/.test(keys)) {
    return /^(?:[EU]Q[A-Za-z0-9_-]{46}|(?:-1|0):[0-9a-fA-F]{64})$/.test(address);
  }
  if (/(BITCOIN CASH|\bBCH\b)/.test(keys)) {
    return /^(?:bitcoincash:)?[qp][a-z0-9]{41,61}$/.test(address);
  }
  if (/(LITECOIN|\bLTC\b)/.test(keys)) {
    return /^(?:ltc1[ac-hj-np-z02-9]{25,90}|[LM3][1-9A-HJ-NP-Za-km-z]{25,34})$/i.test(address);
  }
  if (/(DOGECOIN|\bDOGE\b)/.test(keys)) {
    return /^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
  }
  if (/(CARDANO|\bADA\b)/.test(keys)) {
    return /^addr1[ac-hj-np-z02-9]{20,120}$/i.test(address);
  }
  if (/(POLKADOT|\bDOT\b)/.test(keys)) {
    return new RegExp(`^${BASE58}{47,48}$`).test(address);
  }
  if (/(BITCOIN|\bBTC\b)/.test(keys)) {
    return Boolean(decodeBitcoinMainnetAddress(address));
  }

  return false;
}

export function isSyntacticallyValidManualWalletMemo(
  network: ManualNetwork,
  rawMemo: string,
): boolean {
  const memo = rawMemo.trim();
  if (!memo || /[\u0000-\u001F\u007F]/.test(memo)) return false;
  const keys = networkKeys(network);

  if (/(XRPL|XRP LEDGER|RIPPLE|\bXRP\b)/.test(keys)) {
    if (!/^(?:0|[1-9][0-9]{0,9})$/.test(memo)) return false;
    return BigInt(memo) <= 4_294_967_295n;
  }
  if (/(STELLAR|\bXLM\b)/.test(keys)) {
    return Buffer.byteLength(memo, "utf8") <= 28;
  }
  if (/(TON|OPEN NETWORK)/.test(keys)) {
    return Buffer.byteLength(memo, "utf8") <= 120;
  }

  return Buffer.byteLength(memo, "utf8") <= 120;
}