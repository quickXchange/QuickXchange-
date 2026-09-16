import { ArrowDownUp, ArrowRight, ChevronDown, Clock3, Mail, ShieldCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import './_group.css';

export function Current() {
  const [mode, setMode] = useState<'swap' | 'convert'>('swap');
  const [fixed, setFixed] = useState(false);
  const [sent, setSent] = useState(false);
  const automatic = mode === 'convert';
  const from = automatic ? 'USDT' : 'USD';
  const to = automatic ? 'BTC' : 'USDC';
  return <div className="swap-prototype swap-current"><div className="sp-shell">
    <div className="sp-brand"><span className="sp-brand-mark" />QuickX<b>change</b></div>
    <header className="sp-hero"><div><span className="sp-kicker">QUICKXCHANGE DESK</span><h1>Move money with less noise.</h1></div><span className="sp-trust"><ShieldCheck size={15}/> Secure exchange flow</span></header>
    <section className="sp-card">
      <div className="sp-card-top"><div><span className="sp-kicker">START AN EXCHANGE</span><h2>What are you moving?</h2></div><span className="sp-mode">{automatic ? <Clock3 size={12}/> : <ShieldCheck size={12}/>} {automatic ? 'Convert · automatic' : 'Swap · human processed'}</span></div>
      <div className="sp-tabs" role="tablist" aria-label="Exchange type"><button className={!automatic ? 'active' : ''} onClick={() => setMode('swap')} aria-selected={!automatic}>Swap</button><button className={automatic ? 'active' : ''} onClick={() => setMode('convert')} aria-selected={automatic}>Convert</button></div>
      <label className="sp-amount"><span className="sp-label">You send</span><span className="sp-amount-row"><input defaultValue={automatic ? '1,250' : '2,500'} aria-label="Amount to send"/><button className="sp-asset"><i className="sp-token">{from[0]}</i>{from}<ChevronDown size={13}/></button></span></label>
      <button className="sp-swap" aria-label="Swap assets"><ArrowDownUp size={15}/></button>
      <label className="sp-amount"><span className="sp-label">You receive</span><span className="sp-amount-row"><input value={automatic ? '0.01864' : '2,471.25'} readOnly aria-label="Amount to receive"/><button className="sp-asset"><i className="sp-token">{to[0]}</i>{to}<ChevronDown size={13}/></button></span></label>
      <div className="sp-rate"><span>Estimated rate <strong>{automatic ? '1 USDT = 0.00001491 BTC' : '1 USD = 0.9885 USDC'}</strong></span><button>Refresh</button></div>
      <div className="sp-divider"/>
      <div className="sp-form-grid">
        {automatic && <div className="sp-rate-choices"><button className={!fixed ? 'active' : ''} onClick={() => setFixed(false)}>Floating rate<small>Current market rate</small></button><button className={fixed ? 'active' : ''} onClick={() => setFixed(true)}>Fixed rate<small>Protected for this quote</small></button></div>}
        <label className="sp-field full"><span className="sp-label">Email address</span><input type="email" defaultValue="marin.cole@example.com"/><Mail size={0}/></label>
        <label className="sp-field"><span className="sp-label">Destination address</span><input className="mono" defaultValue={automatic ? 'bc1qsr3...7k4fm2' : '0x9df7...e3d5'} /><Wallet size={0}/></label>
        <label className="sp-field"><span className="sp-label">Destination memo <span className="sp-optional">(optional)</span></span><input placeholder="Tag or memo if required"/></label>
        <label className="sp-field"><span className="sp-label">Refund address</span><input className="mono" defaultValue={automatic ? 'TQ4xqN...J8T89e' : 'wise:marin.cole'}/></label>
        <label className="sp-field"><span className="sp-label">Refund memo <span className="sp-optional">(optional)</span></span><input placeholder="Tag or memo if required"/></label>
      </div>
      <button className="sp-submit" onClick={() => setSent(true)}>{automatic ? 'Start Convert' : 'Request Swap'} <ArrowRight size={16}/></button>
      {sent && <div className="sp-notice">Your {automatic ? 'conversion' : 'swap request'} is ready to review.</div>}
    </section><p className="sp-footnote"><strong>{automatic ? 'Automatic provider' : 'Human settlement desk'}</strong> · You will receive a clear order trail.</p>
  </div></div>;
}