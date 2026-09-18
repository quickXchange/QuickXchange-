import { basePath } from '@/components/shared-app-ui';

export const MARKET_CONVERT_SELECTION_EVENT = 'quickxchange:market-convert-selection';
export const MARKET_SWAP_SELECTION_EVENT = 'quickxchange:market-swap-selection';

export type MarketConvertSelection = {
  id?: string;
  symbol?: string;
  sourceNetwork?: string;
  destinationSymbol?: string;
  destinationNetwork?: string;
  openSelector?: 'source' | 'destination';
};

export type MarketSwapSelection = {
  sourceSettlementOptionId: string;
  targetSettlementOptionId: string;
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
    if (selection.sourceNetwork) params.set('sourceNetwork', selection.sourceNetwork);
    if (selection.destinationSymbol) params.set('dest', selection.destinationSymbol);
    if (selection.destinationNetwork) params.set('destNetwork', selection.destinationNetwork);
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

export function requestMarketSwapSelection(
  selection: MarketSwapSelection,
  navigate?: (path: string) => void,
) {
  const widget = document.getElementById('exchange-widget');
  if (widget) {
    window.dispatchEvent(new CustomEvent<MarketSwapSelection>(
      MARKET_SWAP_SELECTION_EVENT,
      { detail: selection },
    ));
    window.requestAnimationFrame(() => {
      widget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }

  const params = new URLSearchParams({
    sourceOption: selection.sourceSettlementOptionId,
    targetOption: selection.targetSettlementOptionId,
  });
  const path = `/swap?${params.toString()}`;
  if (navigate) navigate(path);
  else window.location.assign(basePath + path);
}
