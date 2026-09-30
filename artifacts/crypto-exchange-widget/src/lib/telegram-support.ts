import {
  getGetPublishedSiteContentQueryKey,
  useGetPublishedSiteContent,
} from '@workspace/api-client-react';
import { resolveTelegramSupportFromPublishedSnapshot } from './telegram-support-value';
export {
  normalizeTelegramSupportInput,
  resolvePublishedTelegramSupportUrl,
  resolveTelegramSupportFromPublishedSnapshot,
  resolveFooterTelegramSupportItems,
  isHistoricalTelegramSupportDestination,
  telegramSupportHandle,
} from './telegram-support-value';

export function usePublishedTelegramSupportUrl(): string | undefined {
  const published = useGetPublishedSiteContent({
    query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 },
  });
  return resolveTelegramSupportFromPublishedSnapshot(published.data);
}