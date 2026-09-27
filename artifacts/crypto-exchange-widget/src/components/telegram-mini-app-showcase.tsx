import {
  ArrowDownUp, ArrowLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardList, Clock3, Home, ListOrdered,
  Radio, Send, ShieldCheck, UserRound, Wallet,
} from 'lucide-react';
import './telegram-mini-app-showcase.css';

type TelegramMiniAppShowcaseProps = {
  miniAppHref: string;
};

const features = [
  { icon: ArrowLeftRight, label: 'Swap & Convert' },
  { icon: Radio, label: 'Live rates' },
  { icon: ClipboardList, label: 'Create orders' },
  { icon: Clock3, label: 'Track orders in real time' },
  { icon: Wallet, label: 'Deposit details' },
  { icon: CheckCircle2, label: 'Order status & progress' },
  { icon: ListOrdered, label: 'View completed orders' },
  { icon: ShieldCheck, label: 'Same QuickXchange experience inside Telegram' },
];

/**
 * Landing-page illustration only. The phone mirrors the Mini App's Exchange
 * step-one structure, but does not request a quote or accept input.
 */
export function TelegramMiniAppShowcase({ miniAppHref }: TelegramMiniAppShowcaseProps) {
  const logoUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/quickxchange-telegram-bot-logo.jpg`;

  return (
    <section id="telegram-mini-app" className="qx-mini-showcase" aria-labelledby="qx-mini-title" data-testid="section-telegram-mini-app-showcase">
      <div className="qx-mini-layout">
        <div className="qx-mini-content">
          <div className="qx-mini-eyebrow"><Send size={13} strokeWidth={2.5} aria-hidden="true" /> TELEGRAM MINI APP</div>
          <h2 className="qx-mini-title" id="qx-mini-title">
            Full exchange experience <span>inside Telegram</span>
          </h2>
          <p className="qx-mini-intro">
            Go from choosing a route to following your order, without switching apps.
            Swap and Convert in a familiar QuickXchange flow, right where your conversations happen.
          </p>

          <div className="qx-mini-divider">Everything in one place</div>
          <ul className="qx-mini-features">
            {features.map(({ icon: Icon, label }) => (
              <li className="qx-mini-feature" key={label}>
                <span className="qx-mini-feature-icon"><Icon size={17} strokeWidth={2} aria-hidden="true" /></span>
                <span>{label}</span>
              </li>
            ))}
          </ul>

          <div className="qx-mini-actions">
            <a className="qx-mini-cta" href={miniAppHref} target="_blank" rel="noopener noreferrer" data-testid="link-open-telegram-mini-app">
              Open Mini App <ArrowUpRight size={18} strokeWidth={2.2} aria-hidden="true" />
            </a>
            <span className="qx-mini-actions-note">Opens in Telegram</span>
          </div>
        </div>

        <figure className="qx-mini-visual" aria-label="Illustrative preview of the QuickXchange Telegram Mini App exchange screen">
          <div className="qx-mini-orbit" aria-hidden="true" />
          <div className="qx-mini-phone" aria-hidden="true">
            <div className="qx-mini-telegram-top">
              <div>
                <ArrowLeft size={17} strokeWidth={2.3} />
                <img className="qx-mini-avatar" src={logoUrl} alt="" />
                <span className="qx-mini-telegram-name"><b>QuickXchange</b><small>mini app</small></span>
              </div>
              <ChevronDown size={17} strokeWidth={2.3} />
            </div>
            <div className="qx-mini-appscreen">
              <div className="qx-mini-screen-body">
                <div className="qx-mini-screen-tabs"><span>Swap</span><span className="is-active">Convert</span></div>
                <div className="qx-mini-screen-heading"><strong>Convert</strong><small>01 / 03</small></div>
                <div className="qx-mini-asset-card">
                  <small>You Send</small>
                  <div className="qx-mini-asset-row">
                    <span className="qx-mini-amount">0</span>
                    <span className="qx-mini-asset-select"><span className="qx-mini-asset-symbol">?</span> Select <ChevronDown size={12} /></span>
                  </div>
                </div>
                <div className="qx-mini-swap-circle"><ArrowDownUp size={16} strokeWidth={2.5} /></div>
                <div className="qx-mini-asset-card">
                  <small>You Receive</small>
                  <div className="qx-mini-asset-row">
                    <span className="qx-mini-amount">0</span>
                    <span className="qx-mini-asset-select purple"><span className="qx-mini-asset-symbol">?</span> Select <ChevronDown size={12} /></span>
                  </div>
                </div>
                <p className="qx-mini-rate-note">Select a valid pair and amount to see the rate</p>
              </div>
              <div className="qx-mini-screen-bottom">
                <span className="qx-mini-screen-continue">Continue</span>
                <div className="qx-mini-screen-nav">
                  <span><Home />Home</span>
                  <span className="is-active"><ArrowLeftRight />Exchange</span>
                  <span><ListOrdered />Orders</span>
                  <span><CircleHelp />Support</span>
                  <span><UserRound />Account</span>
                </div>
              </div>
            </div>
          </div>
          <figcaption className="qx-mini-caption">Illustrative preview · rates appear in the app</figcaption>
        </figure>
      </div>
    </section>
  );
}