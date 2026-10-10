import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Maximize2, X, ZoomIn, ChevronDown, Search, Menu, ArrowRight, QrCode } from 'lucide-react';
import { useI18n as useCustomerI18n } from '@workspace/i18n';
import { basePath } from '../shared-app-ui';
import { CryptoIdentity } from '../crypto-identity';
import './manual-guides.css';

export type GuideKind = 'swap' | 'convert' | 'track';

const Mk = ({ n }: { n: number }) => <span className="mg-mk" aria-hidden="true">{n}</span>;

function Sepa() {
  return (
    <span className="mg-sepa">
      <img src={`${basePath}/payment-methods/sepa-logo.png`} alt="" />
      <span><strong>SEPA Instant</strong><small>EUR</small></span>
    </span>
  );
}

function Field({ label, n, children }: { label: string; n: number; children: ReactNode }) {
  return (
    <div className="mg-field">
      <span className="mg-label">{label}</span>
      <div className="mg-field-row">
        <span className="mg-amount">0</span>
        <span className="mg-select"><Mk n={n} />{children}<ChevronDown aria-hidden="true" className="mg-chev" /></span>
      </div>
    </div>
  );
}

function Scene({ kind }: { kind: GuideKind }) {
  const { t } = useCustomerI18n();
  const brand = (
    <div className="mg-brand">
      <img src={`${basePath}/brand/quickxchange-mark.png`} alt="" />
      <span>QuickXchange</span>
    </div>
  );
  if (kind === 'track') {
    return (
      <div className="mg-card">
        {brand}
        <div className="mg-field">
          <span className="mg-label">{t('customer.manualOrderId')}</span>
          <div className="mg-input"><Mk n={1} /><Search aria-hidden="true" className="mg-chev" /><span className="mg-ph">{t('customer.m14a2299fa3b3')}</span></div>
        </div>
        <div className="mg-field">
          <span className="mg-label">{t('customer.manualToken')}</span>
          <div className="mg-input dashed"><Mk n={2} /><span className="mg-ph">{t('customer.m4872a2e2e81d')}</span></div>
        </div>
        <div className="mg-btn"><Mk n={3} />{t('customer.manualTrackBtn')}</div>
      </div>
    );
  }
  const convert = kind === 'convert';
  return (
    <div className="mg-card">
      <div className="mg-top">
        <div className="mg-tabs">
          <span className={convert ? 'mg-tab' : 'mg-tab on'}>{!convert && <Mk n={1} />}{t('customer.manualSwap')}</span>
          <span className={convert ? 'mg-tab on' : 'mg-tab'}>{convert && <Mk n={1} />}{t('customer.manualConvert')}</span>
        </div>
        <span className="mg-menu" aria-hidden="true"><Menu /></span>
      </div>
      {convert && (
        <div className="mg-seg">
          <Mk n={2} />
          <span className="on">{t('customer.manualFixed')}</span>
          <span>{t('customer.manualFloating')}</span>
        </div>
      )}
      <Field label={t('customer.manualYouSend')} n={convert ? 3 : 2}>
        {convert ? <CryptoIdentity symbol="BTC" name="Bitcoin" size="sm" /> : <CryptoIdentity symbol="USDT" name="Tether" network="TRC20" size="sm" />}
      </Field>
      <Field label={t('customer.manualYouReceive')} n={3}>
        {convert ? <CryptoIdentity symbol="USDT" name="Tether" network="TRC20" size="sm" /> : <Sepa />}
      </Field>
      <div className="mg-btn muted"><Mk n={4} />{t('customer.manualContinue')}<ArrowRight aria-hidden="true" size={16} /></div>
    </div>
  );
}

const CONFIG: Record<GuideKind, { title: string; caption: string; steps: string[] }> = {
  swap: { title: 'customer.m02c6fd5e49c9', caption: 'customer.manualSwapWhen', steps: ['manualSwapA1', 'manualSwapA2', 'manualSwapA3', 'manualSwapA4'] },
  convert: { title: 'customer.mafc7207ab16b', caption: 'customer.manualConvWhen', steps: ['manualConvA1', 'manualConvA2', 'manualConvA3', 'manualConvA4'] },
  track: { title: 'customer.m7df8946d4732', caption: 'customer.manualTrkA1', steps: ['manualTrkA1', 'manualTrkA2', 'manualTrkA3'] },
};

export function ManualGuideFigure({ kind, testId }: { kind: GuideKind; testId?: string }) {
  const { t } = useCustomerI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const cfg = CONFIG[kind];
  const title = t(cfg.title);

  const closeRef = useRef<HTMLButtonElement>(null);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      const first = items[0]!, last = items[items.length - 1]!;
      if (!panelRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.body.classList.add('user-manual-lightbox-open');
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('user-manual-lightbox-open');
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      previous?.focus?.();
    };
  }, [open]);

  const enterFullscreen = () => {
    try { void panelRef.current?.requestFullscreen?.()?.catch(() => undefined); } catch { /* unsupported */ }
  };

  const keyList: ReactNode = (
    <ol className="mg-key">
      {cfg.steps.map((s, i) => <li key={s}><b>{i + 1}</b><span>{t(`customer.${s}`)}</span></li>)}
    </ol>
  );

  return (
    <>
      <figure className="mg-figure" data-testid={testId ?? `figure-guide-${kind}`}>
        <button type="button" className="mg-frame" onClick={() => setOpen(true)} aria-label={t('customer.m6f53bb6d75f1', { v0: title })}>
          <span className="mg-stage"><Scene kind={kind} /></span>
          <span className="mg-badge">{t('customer.manualTutorial')}</span>
          <span className="mg-zoom" aria-hidden="true"><ZoomIn size={15} />{t('customer.m509c517ede79')}</span>
        </button>
        <figcaption>
          <strong>{title}</strong>
          {keyList}
          <small>{t('customer.manualTutorialNote')}</small>
        </figcaption>
      </figure>
      {open && (
        <div className="user-manual-lightbox" role="dialog" aria-modal="true" aria-label={t('customer.md0bf374b1a21', { v0: title })}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="user-manual-lightbox-panel" ref={panelRef}>
            <div className="user-manual-lightbox-toolbar">
              <div><strong>{title}</strong><span>{t('customer.m834ea0165e6a')}</span></div>
              <div className="user-manual-lightbox-actions">
                {canFullscreen && (
                  <button type="button" onClick={enterFullscreen} aria-label={t('customer.mc2a1aa73e36a')}>
                    <Maximize2 size={18} /><span>{t('customer.mc461dbb2bab7')}</span>
                  </button>
                )}
                <button type="button" ref={closeRef} onClick={() => setOpen(false)} aria-label={t('customer.md476f46167b7')}><X size={20} /></button>
              </div>
            </div>
            <div className="user-manual-lightbox-image-wrap mg-lightbox-body">
              <div className="mg-frame static"><span className="mg-stage"><Scene kind={kind} /></span></div>
              {keyList}
              <small className="mg-lb-note">{t('customer.manualTutorialNote')}</small>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Replaces the former video placeholder: a static, localized funding comparison. */
export function FundingGuide() {
  const { t } = useCustomerI18n();
  const lane = (title: string, steps: string[], extra?: ReactNode) => (
    <div className="mg-lane">
      <h4>{title}</h4>
      <ol>
        {steps.map((s, i) => <li key={s}><b>{i + 1}</b><span>{t(`customer.${s}`)}</span></li>)}
      </ol>
      {extra}
    </div>
  );
  return (
    <div className="mg-funding" data-testid="guide-funding">
      <div className="mg-funding-head">
        <strong>{t('customer.manualFundTitle')}</strong>
        <span className="mg-badge inline">{t('customer.manualTutorial')}</span>
      </div>
      <div className="mg-lanes">
        {lane(t('customer.manualFundSwap'), ['manualFs1', 'manualFs2', 'manualFs3'])}
        {lane(t('customer.manualFundConv'), ['manualFc1', 'manualFc2', 'manualFc3', 'manualFc4'],
          <div className="mg-deposit">
            <span className="mg-qr" aria-hidden="true"><QrCode size={30} strokeWidth={1.5} /></span>
            <span className="mg-deposit-copy"><span className="mg-label">{t('customer.manualAddrLabel')}</span><span className="mg-ok">{t('customer.manualQrNote')}</span></span>
          </div>)}
      </div>
      <small>{t('customer.manualTutorialNote')}</small>
    </div>
  );
}
