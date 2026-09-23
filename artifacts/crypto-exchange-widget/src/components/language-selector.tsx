import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Globe2, X } from 'lucide-react';
import { CountryFlag } from './fiat-flag';
import { localeDefinitions, useI18n } from '../i18n';
import type { Locale } from '../i18n';
import '../i18n/language-selector.css';

export interface LanguageSelectorProps {
  className?: string;
  compact?: boolean;
}

const localeCountryCodes: Record<Locale, string> = {
  en: 'us',
  de: 'de',
  es: 'es',
  fr: 'fr',
  ko: 'kr',
  ru: 'ru',
  uk: 'ua',
};

export function LanguageSelector({
  className = '',
  compact = true,
}: LanguageSelectorProps) {
  const { locale, setLocale, t, isLoading } = useI18n();
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, right: 12 });
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const panelId = useId();
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      if (trigger?.isConnected && !trigger.disabled) {
        trigger.focus();
      }
    });
  };

  useEffect(() => {
    if (!open) return;
    const handleOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('pointerdown', handleOutsidePress);
    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => selectedRef.current?.focus());
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePress);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePanelPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPanelPosition({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    };
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open]);

  const selectLocale = async (nextLocale: Locale) => {
    if (nextLocale !== locale) await setLocale(nextLocale);
    close();
  };

  return (
    <div
      ref={rootRef}
      className={`qx-language-selector${compact ? ' qx-language-selector--compact' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="qx-language-trigger"
        aria-label={t('header.selectLanguage')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe2 size={17} aria-hidden="true" />
      </button>

      {open && createPortal(
        <>
          <button
            type="button"
            className="qx-language-backdrop"
            aria-label={t('common.close')}
            onClick={close}
            tabIndex={-1}
          />
          <section
            ref={panelRef}
            id={panelId}
            className="qx-language-panel"
            style={{ top: panelPosition.top, right: panelPosition.right }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <header className="qx-language-panel__header">
              <div>
                <h2 id={titleId}>{t('language.title')}</h2>
                <p id={descriptionId}>{t('language.description')}</p>
              </div>
              <button
                type="button"
                className="qx-language-close"
                aria-label={t('common.close')}
                onClick={close}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="qx-language-list" role="radiogroup" aria-label={t('language.title')}>
              {localeDefinitions.map((item) => {
                const selected = item.code === locale;
                return (
                  <button
                    key={item.code}
                    ref={selected ? selectedRef : undefined}
                    type="button"
                    className={`qx-language-option${selected ? ' is-selected' : ''}`}
                    role="radio"
                    aria-checked={selected}
                    disabled={isLoading}
                    onClick={() => void selectLocale(item.code)}
                  >
                    <CountryFlag
                      code={localeCountryCodes[item.code]}
                      size="sm"
                      className="qx-language-option__flag"
                    />
                    <span className="qx-language-option__label">{item.nativeName}</span>
                    <span className="qx-language-option__code">{item.code.toUpperCase()}</span>
                    <Check
                      size={15}
                      className="qx-language-option__check"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </section>
        </>,
        document.body,
      )}
    </div>
  );
}

export default LanguageSelector;