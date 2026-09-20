import { type CSSProperties, type KeyboardEvent, type ReactNode, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronRight, Search, X } from 'lucide-react';
import { QuickXchangeOverlayHeader } from '@/components/quickxchange-overlay';

export type UniversalSearchSheetCategory = {
  id: string;
  label: ReactNode;
  testSuffix?: string;
};

export type UniversalSearchSheetProps<TOption> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  closeLabel: string;
  searchPlaceholder: string;
  closeSearchLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  categories?: readonly UniversalSearchSheetCategory[];
  activeCategory?: string;
  onCategoryChange?: (id: string) => void;
  options: TOption[];
  renderOption: (option: TOption) => ReactNode;
  onSelectOption: (option: TOption) => void;
  isSelected: (option: TOption) => boolean;
  noOptionsText: ReactNode;
  testIdBase: string;
  searchTestId?: string;
  clearSearchTestId?: string;
  triggerRef: React.RefObject<HTMLElement | null>;
  portalContainer?: HTMLElement | null;
  overlayStyle?: CSSProperties;
  anchoredInsideWidget?: boolean;
  preserveOpenGeometry?: boolean;
  listboxId?: string;
  label?: string;
  getOptionId: (option: TOption) => string;
};

export function UniversalSearchSheet<TOption>({
  open,
  onOpenChange,
  title,
  subtitle,
  closeLabel,
  searchPlaceholder,
  closeSearchLabel,
  query,
  onQueryChange,
  categories,
  activeCategory,
  onCategoryChange,
  options,
  renderOption,
  onSelectOption,
  isSelected,
  noOptionsText,
  testIdBase,
  searchTestId,
  clearSearchTestId,
  triggerRef,
  portalContainer,
  overlayStyle,
  anchoredInsideWidget = false,
  preserveOpenGeometry = false,
  listboxId,
  label,
  getOptionId,
}: UniversalSearchSheetProps<TOption>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeAndFocus = () => {
    triggerRef.current?.focus();
    onOpenChange(false);
  };

  const moveOptionFocus = (
    event: KeyboardEvent<HTMLElement>,
    direction: 1 | -1,
  ) => {
    event.preventDefault();
    const optionButtons = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [],
    );
    if (!optionButtons.length) return;
    const currentIndex = optionButtons.indexOf(event.currentTarget as HTMLButtonElement);
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : optionButtons.length - 1)
      : (currentIndex + direction + optionButtons.length) % optionButtons.length;
    optionButtons[nextIndex]?.focus();
  };

  if (!portalContainer) return null;

  return (
    <DialogPrimitive.Portal container={portalContainer}>
      <div
        className={`qx-overlay-backdrop ${anchoredInsideWidget ? 'qx-widget-anchored swap-contained-selector-overlay' : 'qx-standalone'}`}
        style={overlayStyle}
        data-state={open ? 'open' : 'closed'}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <DialogPrimitive.Content
        ref={rootRef}
        aria-describedby={undefined}
        style={overlayStyle}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        className={`qx-overlay-card ${anchoredInsideWidget ? 'qx-widget-anchored swap-contained-selector convert-contained-selector' : 'qx-standalone'} ${preserveOpenGeometry ? 'qx-preserve-open-geometry' : ''}`}
      >
        <QuickXchangeOverlayHeader
          title={<DialogPrimitive.Title>{title}</DialogPrimitive.Title>}
          subtitle={subtitle}
          closeControl={(
            <DialogPrimitive.Close className="qx-overlay-close" aria-label={closeLabel}>
              <X size={24} strokeWidth={2.5} aria-hidden="true" />
            </DialogPrimitive.Close>
          )}
        />
        <div className="qx-overlay-search-wrapper">
          <div className="qx-overlay-search">
            <Search size={20} aria-hidden="true" className="qx-overlay-search-icon" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeAndFocus();
                if (event.key === 'ArrowDown') moveOptionFocus(event, 1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              data-testid={searchTestId || `search-${testIdBase}`}
            />
            {query && (
              <button
                type="button"
                className="qx-overlay-search-clear"
                onClick={(event) => {
                  event.preventDefault();
                  onQueryChange('');
                  searchInputRef.current?.focus();
                }}
                aria-label={closeSearchLabel}
                data-testid={clearSearchTestId || `cancel-${testIdBase}-search`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {categories && categories.length > 1 && (
          <div className="qx-overlay-chips" role="group" aria-label={label || 'Filter categories'}>
            {categories.map(category => (
              <button
                key={category.id}
                type="button"
                className="qx-overlay-chip active border-t-[color:var(--widget-brand-blue)] border-r-[color:var(--widget-brand-blue)] border-b-[color:var(--widget-brand-blue)] border-l-[color:var(--widget-brand-blue)] text-center"
                aria-pressed={activeCategory === category.id}
                onClick={() => onCategoryChange?.(category.id)}
                data-testid={category.testSuffix ? `filter-${testIdBase}-${category.testSuffix}` : undefined}
              >
                {category.label}
              </button>
            ))}
          </div>
        )}
        <div className="qx-overlay-list" id={listboxId} role="listbox" aria-label={label}>
          {options.map(option => {
            const isSelectedOption = isSelected(option);
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelectedOption}
                className={`qx-asset-option group ${isSelectedOption ? 'selected' : ''}`}
                key={getOptionId(option)}
                data-testid={`option-${testIdBase}-${getOptionId(option)}`}
                onClick={() => {
                  onSelectOption(option);
                  closeAndFocus();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeAndFocus();
                  if (event.key === 'ArrowDown') moveOptionFocus(event, 1);
                  if (event.key === 'ArrowUp') moveOptionFocus(event, -1);
                }}
              >
                {renderOption(option)}
                <div className={`qx-asset-option-check ${!isSelectedOption ? 'qx-asset-option-chevron' : ''}`}>
                  {isSelectedOption ? <Check size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
                </div>
              </button>
            );
          })}
          {!options.length && (
            <div className="qx-overlay-empty">
              {noOptionsText}
            </div>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
