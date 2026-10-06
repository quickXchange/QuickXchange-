import {
  buildTelegramConvertOptions, telegramAssetNetworkKey,
  type TelegramConvertInstrument,
} from "./telegram-wizard";

type ConvertPair = {
  fromAsset: string; fromNetwork: string; toAsset: string; toNetwork: string;
};

/**
 * Convert availability is owned by Quickex, not the Manual Swap config.
 * In production that config may intentionally contain no instant options.
 */
export async function loadTelegramConvertCatalog(baseUrl: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/api/quickex/config`);
  if (!response.ok) return null;
  const config = await response.json() as {
    instruments?: TelegramConvertInstrument[]; pairs?: ConvertPair[];
  };
  const allOptions = buildTelegramConvertOptions(config.instruments ?? [], config.pairs ?? []);
  const keys = new Set(allOptions.map(option => telegramAssetNetworkKey(option.assetCode, option.routeNetwork)));
  const sourceKeys = new Set<string>();
  const convertPairs = (config.pairs ?? []).filter(pair => {
    const source = telegramAssetNetworkKey(pair.fromAsset, pair.fromNetwork);
    const target = telegramAssetNetworkKey(pair.toAsset, pair.toNetwork);
    if (source === target || !keys.has(source) || !keys.has(target)) return false;
    sourceKeys.add(source);
    return true;
  });
  const options = allOptions.filter(option =>
    sourceKeys.has(telegramAssetNetworkKey(option.assetCode, option.routeNetwork)));
  return { options, allOptions, convertPairs };
}
