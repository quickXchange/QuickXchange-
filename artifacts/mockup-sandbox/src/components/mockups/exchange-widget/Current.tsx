import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Mail,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  UserRound,
  Wallet,
  Zap,
} from 'lucide-react';
import brandLogo from '../../../../../crypto-exchange-widget/public/brand/quickxchange-header-light.png';
import './_group.css';

type Mode = 'swap' | 'convert';
type Asset = {
  id: string;
  symbol: string;
  name: string;
  network: string;
  color: string;
  payment?: boolean;
};

const swapAssets: Asset[] = [
  { id: 'usd-wise', symbol: 'USD', name: 'Wise', network: 'Wise', color: '#9fe870', payment: true },
  { id: 'usd-bank', symbol: 'USD', name: 'Bank transfer', network: 'ACH', color: '#4665ee', payment: true },
  { id: 'usdt-trc20', symbol: 'USDT', name: 'Tether', network: 'TRON (TRC20)', color: '#26a17b' },
  { id: 'usdc-eth', symbol: 'USDC', name: 'USD Coin', network: 'Ethereum (ERC20)', color: '#2775ca' },
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', network: 'Bitcoin', color: '#f7931a' },
];

const convertAssets: Asset[] = [
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', network: 'Bitcoin', color: '#f7931a' },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', network: 'Ethereum', color: '#627eea' },
  { id: 'usdt-trc20', symbol: 'USDT', name: 'Tether', network: 'TRON (TRC20)', color: '#26a17b' },
  { id: 'usdc-eth', symbol: 'USDC', name: 'USD Coin', network: 'Ethereum (ERC20)', color: '#2775ca' },
  { id: 'sol', symbol: 'SOL', name: 'Solana', network: 'Solana', color: '#7b61ff' },
];

const rates: Record<string, number> = {
  'usd-wise:usdt-trc20': 0.9824,
  'usd-wise:usdc-eth': 0.9811,
  'usd-wise:btc': 0.00001482,
  'usd-bank:usdt-trc20': 0.9768,
  'usdt-trc20:usdc-eth': 0.9982,
  'usdt-trc20:btc': 0.00001508,
  'btc:eth': 21.6743,
  'btc:usdt-trc20': 66312.42,
  'eth:btc': 0.04612,
  'eth:usdt-trc20': 3059.74,
  'usdc-eth:btc': 0.00001504,
  'sol:usdt-trc20': 142.71,
};

function CryptoIdentity({ asset, compact = false }: { asset: Asset; compact?: boolean }) {
  return (
    <span className={`qx-identity ${compact ? 'qx-identity-compact' : ''}`}>
      <span className={`qx-coin ${asset.payment ? 'qx-payment' : ''}`} style={{ backgroundColor: asset.color }}>
        {asset.payment ? asset.name.slice(0, 1) : asset.symbol.slice(0, 1)}
      </span>
      <span className="qx-identity-copy">
        <span className="qx-identity-primary"><strong>{asset.symbol}</strong><i>{asset.network}</i></span>
        {!compact && <small>{asset.name}</small>}
      </span>
    </span>
  );
}

function AssetPicker({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: Asset[];
  onChange: (value: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((asset) => asset.id === value) ?? options[0];
  const filtered = options.filter((asset) =>
    `${asset.symbol} ${asset.name} ${asset.network}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className={`qx-picker ${open ? 'open' : ''}`} ref={root}>
      <button type="button" className="qx-picker-trigger" aria-label={label} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <CryptoIdentity asset={selected} compact />
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="qx-picker-menu">
          <div className="qx-picker-search">
            <Search size={15} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}...`} />
          </div>
          <div className="qx-picker-options" role="listbox" aria-label={label}>
            {filtered.map((asset) => (
              <button
                type="button"
                role="option"
                aria-selected={asset.id === selected.id}
                className={asset.id === selected.id ? 'selected' : ''}
                key={asset.id}
                onClick={() => {
                  onChange(asset.id);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <CryptoIdentity asset={asset} />
                {asset.id === selected.id && <Check size={14} />}
              </button>
            ))}
            {!filtered.length && <p>No currencies match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value);
}

export function Current() {
  const [mode, setMode] = useState<Mode>('swap');
  const [amount, setAmount] = useState('');
  const [fromId, setFromId] = useState('usd-wise');
  const [toId, setToId] = useState('usdt-trc20');
  const [rateMode, setRateMode] = useState<'FLOATING' | 'FIXED'>('FLOATING');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationMemo, setDestinationMemo] = useState('');
  const [refund, setRefund] = useState('');
  const [refundMemo, setRefundMemo] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');

  const assets = mode === 'swap' ? swapAssets : convertAssets;
  const from = assets.find((asset) => asset.id === fromId) ?? assets[0];
  const availableTargets = assets.filter((asset) => asset.id !== from.id);
  const to = availableTargets.find((asset) => asset.id === toId) ?? availableTargets[0];
  const numericAmount = Number(amount);
  const rate = rates[`${from.id}:${to.id}`] ?? (to.symbol === 'BTC' ? 0.00001504 : from.symbol === 'BTC' ? 66312.42 : 0.9874);
  const receive = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount * rate : 0;
  const fee = receive * (mode === 'swap' ? 0.012 : 0.006);
  const ready = receive > 0;

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setAmount('');
    setNotice('');
    if (nextMode === 'convert') {
      setFromId('btc');
      setToId('eth');
    } else {
      setFromId('usd-wise');
      setToId('usdt-trc20');
    }
  };

  const swapSides = () => {
    const reverseFrom = assets.find((asset) => asset.id === to.id);
    if (!reverseFrom) return;
    setFromId(to.id);
    setToId(from.id);
    setNotice('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setNotice(mode === 'swap'
      ? 'Your swap request is ready. A desk operator will confirm the final amount.'
      : 'Your conversion order is ready and the destination addresses were validated.');
  };

  return (
    <div className="qx-baseline min-h-screen">
      <header className="qx-header">
        <button type="button" className="qx-brand" aria-label="QuickXchange home"><img src={brandLogo} alt="QuickXchange" /></button>
        <nav aria-label="Main navigation">
          <button type="button" className="active">Exchange</button>
          <button type="button">Track an order</button>
          <button type="button">My account</button>
        </nav>
        <div className="qx-header-trust"><span className="qx-live-dot" /> Desk online <i /><button type="button" className="qx-theme" aria-label="Use dark mode"><Moon size={16} /></button><i /><button type="button">Sign in</button><i /><button type="button">Operations <ArrowRight size={13} /></button></div>
        <button type="button" className="qx-mobile-menu" aria-label="Open navigation"><Menu size={19} /></button>
      </header>

      <div className="qx-wrapper">
        <main className="qx-main">
          <section className="qx-hero">
            <div className="qx-eyebrow"><span /> QUICKXCHANGE DESK</div>
            <h1>Move money with<br /><em>less noise.</em></h1>
            <p>One secure action. A human-readable order trail. Direct routes between the currencies you actually use.</p>
            <div className="qx-proof">
              <span><ShieldCheck size={15} /> Custody-conscious</span>
              <span><Clock3 size={15} /> {mode === 'swap' ? 'Desk confirms final' : 'Live provider rates'}</span>
              <span><UserRound size={15} /> {mode === 'swap' ? 'Human-supervised' : 'Clear order tracking'}</span>
            </div>
          </section>

          <section className="qx-layout">
            <form className="qx-card" onSubmit={submit}>
              <div className="qx-card-topline">
                <div><span className="qx-kicker">START AN EXCHANGE</span><h2>What are you moving?</h2></div>
                <span className="qx-secure">{mode === 'swap' ? <ShieldCheck size={13} /> : <Zap size={13} />}{mode === 'swap' ? 'Swap · human processed' : 'Convert · automatic'}</span>
              </div>

              <div className="qx-tabs" data-active={mode}>
                <button type="button" className={mode === 'swap' ? 'selected' : ''} onClick={() => switchMode('swap')}>Swap</button>
                <button type="button" className={mode === 'convert' ? 'selected' : ''} onClick={() => switchMode('convert')}>Convert</button>
              </div>

              {mode === 'swap' && (
                <div className="qx-route">
                  <div className="qx-route-head"><span className="qx-kicker">ROUTE CHECK</span><span>Human processed</span></div>
                  <div className="qx-route-path"><strong>{from.network}</strong><ArrowRight size={14} /><strong>{to.network}</strong></div>
                  <div className="qx-route-grid">
                    <span>Rate<strong>{ready ? formatNumber(rate) : 'Pending'}</strong></span>
                    <span>Total fee<strong>{ready ? `${formatNumber(fee)} ${to.symbol}` : 'Pending'}</strong></span>
                    <span>Expected receive<strong>{ready ? `${formatNumber(receive - fee)} ${to.symbol}` : 'Pending'}</strong></span>
                    {ready && <span>Expected time<strong>~15 min</strong></span>}
                  </div>
                  {!ready && <p>Enter an amount to check availability and calculate your receive amount.</p>}
                </div>
              )}

              <label className={`qx-amount ${mode === 'convert' ? 'qx-convert-amount' : ''}`}>
                <span className="qx-field-label">You send</span>
                <span className="qx-amount-row">
                  <input value={amount} onChange={(event) => { setAmount(event.target.value); setNotice(''); }} inputMode="decimal" placeholder="0.00" />
                  <AssetPicker value={from.id} options={assets} onChange={(id) => { setFromId(id); setNotice(''); }} label="Send currency" />
                </span>
              </label>

              <button type="button" className="qx-swap-button" onClick={swapSides} aria-label="Swap assets"><ArrowDownUp size={16} /></button>

              <label className={`qx-amount ${mode === 'convert' ? 'qx-convert-amount' : ''}`}>
                <span className="qx-field-label">You receive {mode === 'swap' && <small>(estimated)</small>}</span>
                <span className="qx-amount-row">
                  <input readOnly value={ready ? formatNumber(mode === 'swap' ? receive - fee : receive) : ''} placeholder={amount ? 'Calculating…' : mode === 'swap' ? 'Enter an amount' : '0.00'} />
                  <AssetPicker value={to.id} options={availableTargets} onChange={(id) => { setToId(id); setNotice(''); }} label="Receive currency" />
                </span>
                {mode === 'swap' && ready && <small className="qx-estimate-note">Route-dependent desk pricing applied. Subject to operator confirmation.</small>}
              </label>

              {mode === 'convert' && (
                <fieldset className="qx-rate-mode">
                  <legend>Rate type</legend>
                  {(['FLOATING', 'FIXED'] as const).map((choice) => (
                    <button type="button" key={choice} className={rateMode === choice ? 'selected' : ''} onClick={() => setRateMode(choice)}>
                      <span>{choice === 'FLOATING' ? 'Floating rate' : 'Fixed rate'}</span>
                      <small>{choice === 'FLOATING' ? 'Current market rate' : 'Protected for this quote'}</small>
                    </button>
                  ))}
                </fieldset>
              )}

              {mode === 'convert' && ready && (
                <details className="qx-quote" open>
                  <summary>
                    <span>Exchange Rate</span>
                    <strong><CryptoIdentity asset={from} compact /> = {formatNumber(rate)} <CryptoIdentity asset={to} compact /></strong>
                    <i><Clock3 size={12} /> 42s</i>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="qx-quote-grid">
                    <span>You receive<strong>{formatNumber(receive)} {to.symbol}</strong></span>
                    <span>Rate type<strong>{rateMode.toLowerCase()}</strong></span>
                    <span>Network fee<strong>Included</strong></span>
                    <span>Estimated time<strong>~5–15 mins</strong></span>
                  </div>
                </details>
              )}

              <div className="qx-form-rule" />

              {mode === 'swap' ? (
                <>
                  <div className="qx-form-grid">
                    <label><span className="qx-field-label">Contact email</span><span className="qx-input-icon"><Mail size={15} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></span></label>
                    <label><span className="qx-field-label">Your name <small>(optional)</small></span><span className="qx-input-icon"><UserRound size={15} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name on the order" /></span></label>
                  </div>
                  <div className="qx-manual-fields">
                    {!to.payment && <><label><span className="qx-field-label">Destination Address <small>({to.symbol})</small></span><input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={`Your real ${to.symbol} receiving address`} /></label><label><span className="qx-field-label">Destination Memo <small>(optional)</small></span><input value={destinationMemo} onChange={(event) => setDestinationMemo(event.target.value)} placeholder="Memo or tag if required by the destination" /></label></>}
                    <label><span className="qx-field-label">Order note <small>(optional)</small></span><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything our desk should know?" /></label>
                  </div>
                </>
              ) : (
                <div className="qx-convert-fields">
                  <label><span className="qx-field-label">Email address</span><span className="qx-input-icon"><Mail size={16} /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="hello@example.com" /></span></label>
                  <div className="qx-form-grid">
                    <label><span className="qx-field-label">Destination address</span><span className="qx-input-icon"><Wallet size={16} /><input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={`Your ${to.symbol} wallet`} /></span></label>
                    <label><span className="qx-field-label">Destination memo <small>(optional)</small></span><span className="qx-input-icon"><FileText size={16} /><input value={destinationMemo} onChange={(event) => setDestinationMemo(event.target.value)} placeholder="Tag or memo if required" /></span></label>
                  </div>
                  <div className="qx-form-grid">
                    <label><span className="qx-field-label">Refund address</span><span className="qx-input-icon"><ArrowLeftRight size={16} /><input required value={refund} onChange={(event) => setRefund(event.target.value)} placeholder={`Your ${from.symbol} wallet`} /></span></label>
                    <label><span className="qx-field-label">Refund memo <small>(optional)</small></span><span className="qx-input-icon"><FileText size={16} /><input value={refundMemo} onChange={(event) => setRefundMemo(event.target.value)} placeholder="Tag or memo if required" /></span></label>
                  </div>
                </div>
              )}

              <button type="submit" className="qx-submit" disabled={!ready}>
                {mode === 'swap' ? <ShieldCheck size={17} /> : <Zap size={17} />}
                {mode === 'swap' ? 'Submit Swap request' : 'Start Convert'}
                <ArrowRight size={16} />
              </button>
              {notice && <div className="qx-notice"><Check size={16} />{notice}</div>}
            </form>
          </section>
        </main>

        <section className="qx-notes">
          <div><span className="qx-kicker">THE QUICKXCHANGE STANDARD</span><h2>Clarity is a feature.</h2></div>
          <p>{mode === 'swap' ? 'We provide a live estimate so you know what to expect. Once you submit, our desk operator will manually confirm the final amount before proceeding.' : 'Your conversion is quoted and validated by the automatic provider.'}</p>
          <button type="button">Track an existing order <ArrowRight size={14} /></button>
        </section>
      </div>
    </div>
  );
}