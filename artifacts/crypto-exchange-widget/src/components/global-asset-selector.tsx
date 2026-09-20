import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n';
import { UniversalSearchSheet } from './universal-search-sheet';

export type GlobalAssetSelectorCategory = 'crypto' | 'fiat' | 'payment-method';

export type GlobalAssetSelectorOption = {
  id: string;
  category: GlobalAssetSelectorCategory;
  searchText: string;
};

export function normalizeSelectorSearchValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

export function selectorOptionMatchesQuery(searchText: string, query: string): boolean {
  const normalizedQuery = normalizeSelectorSearchValue(query);
  return !normalizedQuery
    || normalizeSelectorSearchValue(searchText).includes(normalizedQuery);
}

type GlobalAssetSelectorProps<TOption extends GlobalAssetSelectorOption> = {
  value: string;
  options: TOption[];
  onChange: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  label: string;
  title: string;
  searchPlaceholder: string;
  closeLabel: string;
  closeSearchLabel: string;
  testId: string;
  renderIdentity: (
    option: TOption,
    placement: 'trigger' | 'option',
  ) => ReactNode;
  noOptionsText?: string;
  noFilteredOptionsText?: string;
  triggerClassName?: string;
  preserveOpenGeometry?: boolean;
};

const CATEGORY_DEFINITIONS = [
  { id: 'all', labelKey: 'selectors.all', testSuffix: 'all' },
  { id: 'crypto', labelKey: 'selectors.crypto', testSuffix: 'crypto' },
  { id: 'fiat', labelKey: 'selectors.fiat', testSuffix: 'fiat' },
  {
    id: 'payment-method',
    labelKey: 'selectors.paymentMethods',
    testSuffix: 'payment-methods',
  },
] as const;

type Category = (typeof CATEGORY_DEFINITIONS)[number]['id'];

/**
 * The single currency and payment-method selector used by both Convert and Swap.
 * Callers own option availability and selection; this component owns presentation only.
 */
export function GlobalAssetSelector<TOption extends GlobalAssetSelectorOption>({
  value,
  options,
  onChange,
  onOpenChange,
  label,
  title,
  searchPlaceholder,
  closeLabel,
  closeSearchLabel,
  testId,
  renderIdentity,
  noOptionsText,
  noFilteredOptionsText,
  triggerClassName,
  preserveOpenGeometry = false,
}: GlobalAssetSelectorProps<TOption>) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [overlayAnchor, setOverlayAnchor] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    bottomOffset: number;
  } | null>(null);

  const selected = options.find(option => option.id === value) || options[0];
  const normalizedQuery = normalizeSelectorSearchValue(query);
  const availableCategories = useMemo(
    () => CATEGORY_DEFINITIONS.filter(category =>
      category.id === 'all' || options.some(option => option.category === category.id)
    ).map(c => ({ ...c, label: t(c.labelKey) })),
    [options, t],
  );
  const filteredOptions = useMemo(
    () => options.filter(option =>
      (activeCategory === 'all' || option.category === activeCategory)
      && selectorOptionMatchesQuery(option.searchText, normalizedQuery)
    ),
    [activeCategory, normalizedQuery, options],
  );
  const listboxId = `${testId}-listbox`;
  const testIdBase = testId.replace('select-', '');

  useEffect(() => {
    onOpenChange?.(open);
    return () => {
      if (open) onOpenChange?.(false);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    setPortalContainer(
      triggerRef.current?.closest<HTMLElement>('.exchange-card') || document.body,
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveCategory('all');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !preserveOpenGeometry) return;

    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewportMeta) return;

    const previousContent = viewportMeta.content;
    const withoutInteractiveWidget = previousContent
      .split(',')
      .map(part => part.trim())
      .filter(part => !part.startsWith('interactive-widget='));
    viewportMeta.content = [
      ...withoutInteractiveWidget,
      'interactive-widget=overlays-content',
    ].join(', ');

    return () => {
      viewportMeta.content = previousContent;
    };
  }, [open, preserveOpenGeometry]);

  useLayoutEffect(() => {
    if (!open) return;

    const updateOverlayAnchor = () => {
      const trigger = triggerRef.current;
      const widget = trigger?.closest<HTMLElement>('.exchange-card');
      const field = trigger?.closest<HTMLElement>('.reference-amount-panel');
      if (!widget || !field) {
        setOverlayAnchor(null);
        return;
      }

      const widgetRect = widget.getBoundingClientRect();
      const fieldRect = field.getBoundingClientRect();
      const headerBottom = widget.querySelector<HTMLElement>('.reference-header')
        ?.getBoundingClientRect().bottom || widgetRect.top;
      const visualViewportTop = window.visualViewport?.offsetTop || 0;
      const visualViewportBottom = visualViewportTop
        + (window.visualViewport?.height || window.innerHeight);

      const margin = 16;
      const visibleTop = Math.max(headerBottom, visualViewportTop + margin);
      const visibleBottom = Math.min(widgetRect.bottom, visualViewportBottom - margin);
      const bottomOffset = Math.max(0, widgetRect.bottom - visibleBottom);
      const fullAnchorHeight = widgetRect.bottom - headerBottom;
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const calculatedMaxHeight = Math.min(fullAnchorHeight, visibleHeight);

      setOverlayAnchor({
        left: fieldRect.left - widgetRect.left,
        width: fieldRect.width,
        maxHeight: Math.max(
          Math.min(240, visibleHeight),
          calculatedMaxHeight,
        ),
        bottomOffset,
      });
    };

    updateOverlayAnchor();
    if (preserveOpenGeometry) return;

    window.addEventListener('resize', updateOverlayAnchor);
    window.visualViewport?.addEventListener('resize', updateOverlayAnchor);

    return () => {
      window.removeEventListener('resize', updateOverlayAnchor);
      window.visualViewport?.removeEventListener('resize', updateOverlayAnchor);
    };
  }, [open, preserveOpenGeometry]);

  const anchoredInsideWidget = portalContainer !== null && portalContainer !== document.body;
  const overlayStyle = overlayAnchor ? {
    '--qx-selector-anchor-left': `${overlayAnchor.left}px`,
    '--qx-selector-anchor-width': `${overlayAnchor.width}px`,
    '--qx-selector-anchor-max-height': `${overlayAnchor.maxHeight}px`,
    '--qx-selector-anchor-bottom-offset': `${overlayAnchor.bottomOffset}px`,
  } as CSSProperties : undefined;

  return (
    <DialogPrimitive.Root modal={false} open={open} onOpenChange={setOpen}>
      <div className={`asset-combobox convert-asset-combobox ${open ? 'open' : ''}`}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            ref={triggerRef}
            className={triggerClassName || 'asset-combobox-trigger convert-asset-combobox-trigger bg-transparent hover:bg-muted/40 outline-none focus-visible:bg-muted/60 transition-colors flex items-center justify-between px-2 py-1.5 rounded-lg w-full min-h-[44px]'}
            aria-label={label}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="dialog"
            data-value={selected?.id || ''}
            data-testid={testId}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span>
              {selected ? renderIdentity(selected, 'trigger') : t('selectors.select')}
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`transition-transform duration-200 text-muted-foreground shrink-0 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </DialogPrimitive.Trigger>
      </div>

      <UniversalSearchSheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        subtitle={t('selectors.optionsAvailable', { count: options.length })}
        closeLabel={closeLabel}
        searchPlaceholder={searchPlaceholder}
        closeSearchLabel={closeSearchLabel}
        query={query}
        onQueryChange={setQuery}
        categories={availableCategories}
        activeCategory={activeCategory}
        onCategoryChange={(id) => setActiveCategory(id as Category)}
        options={filteredOptions}
        renderOption={(option) => renderIdentity(option, 'option')}
        onSelectOption={(option) => onChange(option.id)}
        isSelected={(option) => option.id === selected?.id}
        noOptionsText={
          normalizedQuery || activeCategory !== 'all'
            ? noFilteredOptionsText || t('selectors.noOptions')
            : noOptionsText || t('selectors.noOptions')
        }
        testIdBase={testIdBase}
        triggerRef={triggerRef}
        portalContainer={portalContainer}
        overlayStyle={overlayStyle}
        anchoredInsideWidget={anchoredInsideWidget}
        preserveOpenGeometry={preserveOpenGeometry}
        listboxId={listboxId}
        label={label}
        getOptionId={(option) => option.id}
      />
    </DialogPrimitive.Root>
  );
}