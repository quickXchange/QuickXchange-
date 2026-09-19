import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  LockKeyhole,
  Menu,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import './ModernConcept.css';

type Mode = 'swap' | 'convert';
type Asset = { id: string; symbol: string; name: string; network: string; color: string };

const assets: Asset[] = [
  { id: 'usd', symbol: 'USD', name: 'Wise balance', network: 'Wise', color: '#b7ee63' },
  { id: 'usdt', symbol: 'USDT', name: 'Tether', network: 'TRON', color: '#40b995' },
  { id: 'usdc', symbol: 'USDC', name: 'USD Coin', network: 'Ethereum', color: '#5f91ec' },
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', network: 'Bitcoin', color: '#f4a340' },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', network: 'Ethereum', color: '#8188dd' },
  { id: 'sol', symbol: 'SOL', name: 'Solana', network: 'Solana', color: '#8c79ec' },
];

const rates: Record<string, number> = {
  'usd:usdt': 0.9824,
  'usd:usdc': 0.9811,
  'usd:btc': 0.00001482,
  'btc:eth': 21.6743,
  'eth:btc': 0.04612,
  'eth:usdt': 3059.74,
  'usdt:usdc': 0.9982,
  'sol:usdt': 142.71,
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value);

function AssetGlyph({ asset }: { asset: Asset }) {
  return (
    <span className="modern-glyph" style={{ backgroundColor: asset.color }}>
      {asset.symbol.slice(0, 1)}
    </span>
  );
}

function AssetSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Asset[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((asset) => asset.id === value) ?? options[0];
  return (
    <div className={`modern-select ${open ? 'is-open' : ''}`}>
      <button type="button" className="modern-select-trigger" onClick={() => setOpen((current) => !current)}>
        <AssetGlyph asset={selected} />
        <span><strong>{selected.symbol}</strong><small>{selected.network}</small></span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="modern-select-menu">
          {options.map((asset) => (
            <button
              type="button"
              key={asset.id}
              className={asset.id === selected.id ? 'selected' : ''}
              onClick={() => { onChange(asset.id); setOpen(false); }}
            >
              <AssetGlyph asset={asset} />
              <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
              {asset.id === selected.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ModernConcept() {
  const [mode, setMode] = useState<Mode>('swap');
  const [amount, setAmount] = useState('');
  const [fromId, setFromId] = useState('usd');
  const [toId, setToId] = useState('usdt');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [fixed, setFixed] = useState(false);

  const from = assets.find((asset) => asset.id === fromId) ?? assets[0];
  const choices = assets.filter((asset) => asset.id !== from.id);
  const to = choices.find((asset) => asset.id === toId) ?? choices[0];
  const numericAmount = Number(amount);
  const rate = rates[`${from.id}:${to.id}`] ?? (to.id === 'btc' ? 0.00001504 : from.id === 'btc' ? 66312.42 : 0.9874);
  const receive = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount * rate : 0;
  const fee = receive * (mode === 'swap' ? 0.012 : 0.006);
  const ready = receive > 0;

  const subtitle = useMemo(
    () => mode === 'swap' ? 'A clear quote, then a human confirmation.' : 'A live rate, held while you finish.',
    [mode],
  );

  const selectMode = (next: Mode) => {
    setMode(next);
    setAmount('');
    setNotice('');
    if (next === 'convert') { setFromId('btc'); setToId('eth'); }
    else { setFromId('usd'); setToId('usdt'); }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (ready) setNotice(mode === 'swap' ? 'Quote sent. Our desk will confirm the final amount.' : 'Conversion ready. Your route is reserved for 42 seconds.');
  };

  return (
    <div className="modern-shell">
      <header className="modern-header">
        <button type="button" className="modern-wordmark" aria-label="QuickXchange home">
          <span className="modern-mark"><span /></span>
          <span>quick<span>x</span>change</span>
        </button>
        <div className="modern-header-actions">
          <span className="modern-online"><i /> desk online</span>
          <button type="button" className="modern-menu" aria-label="Open menu"><Menu size={17} /></button>
        </div>
      </header>

      <div className="modern-intro">
        <div className="modern-overline"><span /> QUICKXCHANGE / 01</div>
        <h1>Move money.<br /><em>Stay certain.</em></h1>
        <p>One calm place to exchange currencies with rates, routes, and next steps in view.</p>
      </div>

      <main className="modern-panel">
        <div className="modern-panel-heading">
          <div>
            <span className="modern-label">EXCHANGE DESK</span>
            <h2>What’s the move?</h2>
          </div>
          <span className="modern-shield"><ShieldCheck size={14} /> protected</span>
        </div>

        <div className="modern-tabs" data-mode={mode}>
          <button type="button" className={mode === 'swap' ? 'active' : ''} onClick={() => selectMode('swap')}>Swap <small>human-led</small></button>
          <button type="button" className={mode === 'convert' ? 'active' : ''} onClick={() => selectMode('convert')}>Convert <small>automatic</small></button>
        </div>

        <form onSubmit={submit}>
          <div className="modern-flow">
            <label className="modern-amount">
              <span className="modern-field-label">You send</span>
              <div>
                <input value={amount} onChange={(event) => { setAmount(event.target.value); setNotice(''); }} inputMode="decimal" placeholder="0.00" aria-label="Amount to send" />
                <AssetSelect value={from.id} options={assets} onChange={(value) => { setFromId(value); setNotice(''); }} />
              </div>
            </label>
            <button type="button" className="modern-flip" aria-label="Swap assets" onClick={() => { setFromId(to.id); setToId(from.id); setNotice(''); }}>
              <ArrowDown size={16} />
            </button>
            <label className="modern-amount receive">
              <span className="modern-field-label">You receive <small>{mode === 'swap' ? 'estimated' : 'quoted'}</small></span>
              <div>
                <input readOnly value={ready ? money(mode === 'swap' ? receive - fee : receive) : ''} placeholder="—" aria-label="Amount to receive" />
                <AssetSelect value={to.id} options={choices} onChange={(value) => { setToId(value); setNotice(''); }} />
              </div>
            </label>
          </div>

          <div className="modern-summary">
            <div><span>Rate</span><strong>{ready ? `1 ${from.symbol} = ${money(rate)} ${to.symbol}` : 'Enter an amount'}</strong></div>
            <div><span>Network fee</span><strong>{ready ? `${money(fee)} ${to.symbol}` : 'Included'}</strong></div>
            <div><span>Arrival</span><strong>{mode === 'swap' ? '~15 min' : '~5–15 min'}</strong></div>
          </div>

          {mode === 'convert' && (
            <button type="button" className={`modern-rate-toggle ${fixed ? 'chosen' : ''}`} onClick={() => setFixed((current) => !current)}>
              <span className="modern-toggle-icon"><Sparkles size={13} /></span>
              <span><strong>{fixed ? 'Fixed rate selected' : 'Use a fixed rate'}</strong><small>Protect this quote while you complete your details</small></span>
              <span className="modern-toggle-pill">{fixed ? 'ON' : 'OFF'}</span>
            </button>
          )}

          <div className="modern-details">
            <label><span className="modern-field-label">Email for your order</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
            <label><span className="modern-field-label">{mode === 'swap' ? `Destination address (${to.symbol})` : `Your ${to.symbol} wallet`}</span><input required placeholder={`Paste your ${to.symbol} address`} /></label>
          </div>

          <button className="modern-submit" type="submit" disabled={!ready}>
            <span>{mode === 'swap' ? 'Request a swap' : 'Start conversion'}</span>
            <ArrowRight size={17} />
          </button>
          {notice && <div className="modern-notice"><Check size={15} /> {notice}</div>}
        </form>
      </main>

      <footer className="modern-footer">
        <span><LockKeyhole size={13} /> Non-custodial by design</span>
        <span><Clock3 size={13} /> Rates refresh live</span>
        <span><WalletCards size={13} /> Clear order trail</span>
      </footer>
    </div>
  );
}

export default ModernConcept;