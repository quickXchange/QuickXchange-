import { useState } from 'react';
import { ArrowRight, ChevronLeft, Clock3, Mail, Menu, ShieldCheck, Wallet, Zap } from 'lucide-react';
import './_group.css';

function CryptoIdentity({ symbol, network }: { symbol: string; network: string }) {
  return (
    <span className="crypto-identity">
      <span className={`crypto-logo current-crypto-logo current-crypto-logo--${symbol.toLowerCase()}`}>{symbol.slice(0, 1)}</span>
      <span className="crypto-identity-primary">
        <strong>{symbol}</strong>
        <span className="crypto-network-badge">{network}</span>
      </span>
    </span>
  );
}

function TermsAcceptance() {
  const [checked, setChecked] = useState(false);
  return (
    <div className="order-terms convert-terms-card policy-acceptance mt-2 flex items-start gap-3">
      <input type="checkbox" id="convert-terms" required checked={checked} onChange={event => setChecked(event.target.checked)} aria-label="I agree to the Terms and Conditions and AML/KYC policy" data-testid="convert-terms-checkbox" className="mt-1 w-[18px] h-[18px] rounded border-border text-primary focus:ring-primary/20 shrink-0" />
      <span className="policy-acceptance__copy text-[14px] font-medium text-foreground leading-relaxed">
        <label htmlFor="convert-terms" className="cursor-pointer select-none">I agree to the <a href="#terms">Terms and Conditions</a> and <a href="#aml">AML/KYC policy</a></label>
      </span>
    </div>
  );
}

export function ConvertCurrent() {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationMemo, setDestinationMemo] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [refundAddress, setRefundAddress] = useState('');
  const [refundMemo, setRefundMemo] = useState('');

  return (
    <main className="current-step-two min-h-screen">
      <div className="public-shell">
        <div className="exchange-card exchange-card-expanded redesigned-widget convert-widget convert-widget-step-2">
          <div className="reference-header">
            <div className="reference-top-bar">
              <div className="widget-tabs-pill" role="group" aria-label="Exchange type">
                <button type="button" aria-pressed="false" data-mode-target="swap">Swap</button>
                <button type="button" className="active" aria-pressed="true" data-mode-target="convert">Convert</button>
              </div>
              <button type="button" className="reference-menu-btn" aria-label="Open navigation" data-testid="widget-menu-button"><Menu size={20} /></button>
            </div>
            <div className="reference-title-row">
              <h2>Convert <span>Crypto</span></h2>
              <div className="reference-realtime-badge"><Zap size={15} /> Real-time rate</div>
            </div>
          </div>

          <form className="widget-form-body convert-widget-form-viewport">
            <div className="convert-step-panel animate-in fade-in slide-in-from-right-4 duration-300" data-testid="convert-step-wallets">
              <div className="convert-route-summary rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-testid="convert-wallet-quote-summary">
                <button type="button" className="convert-route-summary-back flex items-center justify-center rounded-full border border-border bg-muted/30 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" data-testid="convert-button-back" aria-label="Back to quote">
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                <div className="convert-route-summary-main">
                  <div className="convert-route-summary-assets">
                    <span className="convert-route-summary-asset convert-route-summary-asset--from" data-testid="convert-summary-from-logo"><CryptoIdentity symbol="USDT" network="TRON" /></span>
                    <span className="convert-route-summary-arrow text-muted-foreground/60"><ArrowRight size={14} strokeWidth={2.5} aria-hidden="true" /></span>
                    <span className="convert-route-summary-asset convert-route-summary-asset--to" data-testid="convert-summary-to-logo"><CryptoIdentity symbol="BTC" network="BITCOIN" /></span>
                  </div>
                  <div className="convert-route-summary-amounts font-mono">
                    <span className="convert-route-summary-amount convert-route-summary-amount--send font-bold text-foreground" data-testid="convert-summary-send-amount">1,250 USDT</span>
                    <span className="convert-route-summary-amount convert-route-summary-amount--receive truncate" data-testid="convert-summary-receive-amount">≈0.01864 BTC</span>
                  </div>
                </div>
              </div>

              <div className="order-details-content convert-order-details-content flex flex-col gap-4">
                <div className="order-detail-field order-detail-field--destination flex flex-col gap-1.5">
                  <label htmlFor="convert-destination" className="text-[13px] font-semibold text-muted-foreground">Destination address · BTC (BITCOIN)</label>
                  <div className="relative">
                    <Wallet size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input id="convert-destination" required value={destinationAddress} onChange={event => setDestinationAddress(event.target.value)} data-testid="convert-input-destination-address" placeholder="Enter BTC address" className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                  </div>
                </div>
                <div className="order-detail-field order-detail-field--memo flex flex-col gap-1.5">
                  <label htmlFor="convert-destination-memo" className="text-[13px] font-semibold text-muted-foreground">Memo or Tag <small className="font-normal">(Optional)</small></label>
                  <div className="relative">
                    <input id="convert-destination-memo" value={destinationMemo} onChange={event => setDestinationMemo(event.target.value)} data-testid="convert-input-destination-memo" placeholder="Enter memo or tag if required" className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] px-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                  </div>
                </div>
                <div className="order-detail-field order-detail-field--email flex flex-col gap-1.5">
                  <label htmlFor="convert-email" className="text-[13px] font-semibold text-muted-foreground">Email Address</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input id="convert-email" type="email" required value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} autoComplete="email" data-testid="convert-input-email" placeholder="Enter your email address" className="font-sans text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                  </div>
                </div>
                <div className="order-detail-field order-detail-field--refund flex flex-col gap-1.5">
                  <label htmlFor="convert-refund" className="text-[13px] font-semibold text-muted-foreground">Refund Address <small className="font-normal">(Optional)</small></label>
                  <div className="relative">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <input id="convert-refund" value={refundAddress} onChange={event => setRefundAddress(event.target.value)} data-testid="convert-input-refund-address" placeholder="Add a refund address" className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] pl-11 pr-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm" />
                  </div>
                </div>
                <div className={`order-detail-field order-detail-field--refund-memo transition-all duration-300 overflow-hidden ${refundAddress.trim() ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="convert-refund-memo" className="text-[13px] font-semibold text-muted-foreground">Refund Memo <small className="font-normal">(Optional)</small></label>
                    <input id="convert-refund-memo" value={refundMemo} onChange={event => setRefundMemo(event.target.value)} disabled={!refundAddress.trim()} data-testid="convert-input-refund-memo" placeholder="Enter memo or tag if required" className="font-mono text-[14px] placeholder:font-sans placeholder:text-[14px] w-full h-[54px] px-4 rounded-xl border border-border bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50" />
                  </div>
                </div>
                <TermsAcceptance />
                <div className="order-actions convert-order-actions mt-2 flex flex-col gap-4">
                  <button type="button" disabled className="button button-primary widget-primary-submit w-full h-[54px] rounded-xl text-[16px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" data-testid="convert-button-submit">
                    Place Order <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}