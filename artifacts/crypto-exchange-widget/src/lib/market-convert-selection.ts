import { basePath } from '@/components/shared-app-ui';

export const MARKET_CONVERT_SELECTION_EVENT = 'quickxchange:market-convert-selection';

export type MarketConvertSelection = {
  id?: string;
  symbol?: string;
  destinationSymbol?: string;
  openSelector?: 'source' | 'destination';
};

export function requestMarketConvertSelection(
  selection: MarketConvertSelection,
  navigate?: (path: string) => void
) {
  const widget = document.getElementById('exchange-widget');
  if (widget) {
    window.dispatchEvent(new CustomEvent<MarketConvertSelection>(
      MARKET_CONVERT_SELECTION_EVENT,
      { detail: selection },
    ));
    window.requestAnimationFrame(() => {
      widget.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  } else {
    const params = new URLSearchParams();
    if (selection.symbol) params.set('source', selection.symbol);
    if (selection.destinationSymbol) params.set('dest', selection.destinationSymbol);
    if (selection.openSelector) params.set('open', selection.openSelector);

    const qs = params.toString();
    const path = `/convert${qs ? `?${qs}` : ''}`;

    if (navigate) {
      navigate(path);
    } else {
      window.location.assign(basePath + path);
    }
  }
}
