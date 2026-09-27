import { useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Clock3,
  CreditCard,
  FileText,
  Mail,
  Menu,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import './_group.css';

type RouteDirection = 'fiat-crypto' | 'crypto-fiat';

function RouteMark({ symbol, isFiat = false }: { symbol: string; isFiat?: boolean }) {
  return (
    <span className={`swap-route-recap-icon current-route-mark${isFiat ? ' is-fiat' : ''}`} aria-hidden="true">
      <span className="current-route-mark-core">{isFiat ? symbol : symbol.slice(0, 1)}</span>
    </span>
  );
}

function TermsAcceptance({ id }: { id: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="order-terms convert-terms-card policy-acceptance mt-2 flex items-start gap-3">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={event => setChecked(event.target.checked)}
        aria-label="I agree to the Terms and Conditions and AML/KYC policy"
        data-testid={`${id}-checkbox`}
        className="mt-1 w-[18px] h-[18px] rounded border-border text-primary focus:ring-primary/20 shrink-0"
      />
      <span className="policy-acceptance__copy text-[14px] font-medium text-foreground leading-relaxed">
        <label htmlFor={id} className="cursor-pointer select-none">
          I agree to the <a href="#terms">Terms and Conditions</a> and <a href="#aml">AML/KYC policy</a>
        </label>
      </span>
    </div>
  );
}

export function SwapCurrent() {
  const [direction, setDirection] = useState<RouteDirection>('fiat-crypto');
  const fiatToCrypto = direction === 'fiat-crypto';
  const from = fiatToCrypto
    ? { title: 'Bank Transfer', assetCode: 'USD', symbol: 'USD', fiat: true }
    : { title: 'Bitcoin', assetCode: 'BTC', symbol: 'BTC', fiat: false };
  const to = fiatToCrypto
    ? { title: 'Bitcoin', assetCode: 'BTC', symbol: 'BTC', fiat: false }
    : { title: 'Bank Transfer', assetCode: 'USD', symbol: 'USD', fiat: true };
  const [refundAddress, setRefundAddress] = useState('');

  return (
    <main className="current-step-two min-h-screen">
      <div className="current-step-two-controls" role="group" aria-label="Swap route example">
        <span>Swap Step 2 sample route</span>
        <button type="button" className={fiatToCrypto ? 'active' : ''} onClick={() => setDirection('fiat-crypto')}>
          Fiat → crypto
        </button>
        <button type="button" className={!fiatToCrypto ? 'active' : ''} onClick={() => setDirection('crypto-fiat')}>
          Crypto → fiat
        </button>
      </div>
      <div className="public-shell">
        <form className="exchange-card exchange-card-expanded redesigned-widget swap-widget-flow swap-widget-step-2 swap-compact-step-2">
          <div className="reference-header">
            <div className="reference-top-bar">
              <div className="widget-tabs-pill" role="group" aria-label="Exchange type">
                <button type="button" className="active" aria-pressed="true" data-mode-target="swap">Swap</button>
                <button type="button" aria-pressed="false" data-mode-target="convert">Convert</button>
              </div>
              <button type="button" className="reference-menu-btn" aria-label="Open navigation" data-testid="widget-menu-button">
                <Menu size={20} />
              </button>
            </div>
            <div className="reference-title-row">
              <h2>Swap <span>Currencies</span></h2>
              <div className="swap-step2-progress" aria-label="Step 2 of 3">
                <span>Step 2 of 3</span>
                <span className="swap-step2-progress-track" aria-hidden="true"><i /><i className="is-active" /><i /></span>
              </div>
            </div>
          </div>

          <div className="swap-step-panel swap-fulfillment-step animate-in fade-in slide-in-from-right-4 duration-300" data-testid="swap-step-wallets" tabIndex={-1}>
            <div className="swap-step2-summary" data-testid="swap-wallet-quote-summary">
              <button type="button" className="swap-step2-change" data-testid="swap-button-back" aria-label="Change currencies">
                <ArrowLeftRight size={13} strokeWidth={2.3} /><span>Change</span>
              </button>
              <div className="swap-step2-route">
                <div className="swap-step2-party" data-testid="swap-summary-from-logo">
                  <span className="swap-step2-party-icon"><RouteMark symbol={from.symbol} isFiat={from.fiat} /></span>
                  <strong>{from.title}</strong>
                  <span className="swap-step2-party-badge">{from.assetCode}</span>
                </div>
                <span className="swap-step2-route-arrow"><ArrowRight size={24} strokeWidth={2.3} aria-hidden="true" /></span>
                <div className="swap-step2-party" data-testid="swap-summary-to-logo">
                  <span className="swap-step2-party-icon"><RouteMark symbol={to.symbol} isFiat={to.fiat} /></span>
                  <strong>{to.title}</strong>
                  <span className="swap-step2-party-badge">{to.assetCode}</span>
                </div>
              </div>
              <div className="swap-step2-equation font-mono">
                <span data-testid="swap-summary-send-amount">{fiatToCrypto ? '2,500.00' : '0.042'} {from.assetCode}</span>
                <span aria-hidden="true">≈</span>
                <span data-testid="swap-summary-receive-amount">{fiatToCrypto ? '0.04162' : '2,471.25'} {to.assetCode}</span>
              </div>
            </div>

            <div className="swap-step2-rate-row">
              <span className="swap-step2-rate-icon" aria-hidden="true"><Clock3 size={18} /></span>
              <span className="swap-step2-rate-copy"><strong>Rate reserved</strong><small>Complete your details to proceed</small></span>
              <span className="swap-step2-countdown"><Clock3 size={13} aria-hidden="true" /> 04:32</span>
            </div>

            <div className="order-details-content swap-step2-fields">
              {fiatToCrypto && (
                <div className="order-detail-field order-detail-field--email flex flex-col gap-1.5">
                  <label htmlFor="swap-email" className="text-[13px] font-semibold text-muted-foreground">
                    Email Address <span className="required-field-mark" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input id="swap-email" type="email" placeholder="Enter your email address" data-testid="input-customer-email" className="font-sans text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                  </div>
                </div>
              )}

              {to.fiat ? (
                <>
                  <div className="order-detail-field swap-direct-field-card flex flex-col gap-1.5" data-testid="swap-detail-card-target_name">
                    <label htmlFor="swap-detail-target_name" className="swap-step2-field-label">Account holder name <span className="required-field-mark" aria-hidden="true">*</span></label>
                    <div className="swap-step2-input-shell">
                      <CreditCard size={18} className="swap-step2-input-icon" aria-hidden="true" />
                      <input id="swap-detail-target_name" required placeholder="Enter your full name" data-testid="input-detail-target_name" className="font-sans swap-step2-input text-[14px] placeholder:font-sans placeholder:text-[14px] w-full disabled:cursor-not-allowed disabled:opacity-50" />
                    </div>
                  </div>
                  <div className="order-detail-field order-detail-field--refund flex flex-col gap-1.5">
                    <label htmlFor="swap-refund" className="text-[13px] font-semibold text-muted-foreground">Refund Address <small className="font-normal">(Optional)</small></label>
                    <div className="relative">
                      <WalletCards size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input id="swap-refund" placeholder="Add a refund address" data-testid="input-refund-address" className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="order-detail-field order-detail-field--destination">
                    <label htmlFor="swap-destination" className="swap-step2-field-label">Receiving Wallet Address <span className="required-field-mark" aria-hidden="true">*</span></label>
                    <div className="swap-step2-input-shell">
                      <WalletCards size={18} className="swap-step2-input-icon" aria-hidden="true" />
                      <input id="swap-destination" required placeholder={`Enter your ${to.assetCode} (Bitcoin) address`} spellCheck={false} autoCapitalize="none" data-testid="input-destination-address" className="swap-step2-input font-mono" />
                    </div>
                  </div>
                  {!fiatToCrypto && (
                    <div className="order-detail-field order-detail-field--refund flex flex-col gap-1.5">
                      <label htmlFor="swap-refund" className="text-[13px] font-semibold text-muted-foreground">Refund Address <small className="font-normal">(Optional)</small></label>
                      <div className="relative">
                        <WalletCards size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input id="swap-refund" value={refundAddress} onChange={event => setRefundAddress(event.target.value)} placeholder="Add a refund address" spellCheck={false} autoCapitalize="none" data-testid="input-refund-address" className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                      </div>
                    </div>
                  )}
                  {!fiatToCrypto && from.symbol === 'BTC' && (
                    <div className={`order-detail-field order-detail-field--refund-memo transition-all duration-300 overflow-hidden ${refundAddress.trim() ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="swap-refund-memo" className="text-[13px] font-semibold text-muted-foreground">Refund Memo <small className="font-normal">(Optional)</small></label>
                        <input id="swap-refund-memo" disabled={!refundAddress.trim()} placeholder="Refund memo" data-testid="input-refund-memo" className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] px-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50" />
                      </div>
                    </div>
                  )}
                  {!fiatToCrypto && (
                    <div className="order-detail-field order-detail-field--email flex flex-col gap-1.5">
                      <label htmlFor="swap-email" className="text-[13px] font-semibold text-muted-foreground">Email Address</label>
                      <div className="relative">
                        <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input id="swap-email" type="email" placeholder="Enter your email address" data-testid="input-customer-email" className="font-sans text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                      </div>
                    </div>
                  )}
                </>
              )}

              <TermsAcceptance id="swap-terms" />
              <div className="order-actions convert-order-actions mt-2 flex flex-col gap-4">
                <button type="button" className="button button-primary widget-primary-submit w-full h-[54px] rounded-xl text-[16px] flex items-center justify-center gap-2" data-testid="swap-button-submit">
                  Place Swap Order <ArrowRight size={18} />
                </button>
                <p className="swap-step2-security"><ShieldCheck size={14} aria-hidden="true" /><span>Your information is secure and encrypted</span></p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}