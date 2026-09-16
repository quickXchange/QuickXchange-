import { ArrowDownUp, ArrowRight, ChevronDown, Clock3, Copy, Mail, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import './_group.css';
import './Redesigned.css';

export function Redesigned() {
  const [mode, setMode] = useState<'swap' | 'convert'>('convert');
  const [fixed, setFixed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const automatic = mode === 'convert';
  const from = automatic ? 'USDT' : 'USD'; const to = automatic ? 'BTC' : 'USDC';
  return <div className="swap-prototype swap-redesigned"><div className="sp-shell rx-shell">
    <div className="rx-brandline"><div className="sp-brand"><span className="sp-brand-mark"/>QuickX<b>change</b></div><span className="rx-secure"><ShieldCheck size={14}/> Secure exchange</span></div>
    <section className="rx-frame">
      <header className="rx-head"><div><span className="sp-kicker">EXCHANGE DESK</span><h1>Choose your route</h1><p>Quote first. Move with clarity.</p></div><div className="rx-tabs" role="tablist"><button className={!automatic ? 'active' : ''} onClick={() => setMode('swap')}><ShieldCheck size={13}/> Swap</button><button className={automatic ? 'active' : ''} onClick={() => setMode('convert')}><Clock3 size={13}/> Convert</button></div></header>
      <div className="rx-flow"><section className="rx-amount"><span>You send</span><div><input defaultValue={automatic ? '1,250' : '2,500'} aria-label="Amount to send"/><button><i className="sp-token">{from[0]}</i>{from}<ChevronDown size={13}/></button></div><small>{automatic ? 'Tether · TRC20' : 'USD · Wise'}</small></section><button className="rx-swap" aria-label="Reverse route"><ArrowDownUp size={16}/></button><section className="rx-amount"><span>You receive</span><div><input value={automatic ? '0.01864' : '2,471.25'} readOnly aria-label="Amount to receive"/><button><i className="sp-token">{to[0]}</i>{to}<ChevronDown size={13}/></button></div><small>{automatic ? 'Bitcoin · mainnet' : 'USD Coin · Polygon'}</small></section></div>
      <div className="rx-quote"><div><span>Quoted rate</span><strong>{automatic ? '1 USDT = 0.00001491 BTC' : '1 USD = 0.9885 USDC'}</strong></div><div><span>{automatic ? 'Quote expires' : 'Desk response'}</span><strong>{automatic ? '02:18' : 'within 15 min'}</strong></div><button><RefreshCw size={13}/> Refresh</button></div>
      {automatic ? <div className="rx-rate"><span>Rate mode</span><div><button className={!fixed ? 'active' : ''} onClick={() => setFixed(false)}>Floating <small>market rate</small></button><button className={fixed ? 'active' : ''} onClick={() => setFixed(true)}>Fixed <small>protected quote</small></button></div></div> : <div className="rx-human"><ShieldCheck size={15}/><span><strong>Human processed</strong> A settlement specialist verifies your route before funds move.</span></div>}
      <div className="rx-details"><div className="rx-details-title"><span className="sp-kicker">SETTLEMENT DETAILS</span><p>Where we can reach you and safely return funds.</p></div><div className="rx-fields">
        <label className="rx-field email"><span>Email address</span><div><Mail size={14}/><input defaultValue="marin.cole@example.com"/></div></label>
        <label className="rx-field"><span>Destination address</span><div><Wallet size={14}/><input className="rx-mono" defaultValue={automatic ? 'bc1qsr3...7k4fm2' : '0x9df7...e3d5'}/></div></label>
        <label className="rx-field"><span>Destination memo <em>optional</em></span><div><input placeholder="Tag or memo if required"/></div></label>
        <label className="rx-field"><span>Refund address</span><div><Copy size={14}/><input className="rx-mono" defaultValue={automatic ? 'TQ4xqN...J8T89e' : 'wise:marin.cole'}/></div></label>
        <label className="rx-field"><span>Refund memo <em>optional</em></span><div><input placeholder="Tag or memo if required"/></div></label>
      </div></div>
      <footer className="rx-footer"><p>{automatic ? 'Network fee included in your quoted receive amount.' : 'Your request is reviewed before a settlement instruction is issued.'}</p><button onClick={() => setSubmitted(true)}>{automatic ? 'Start Convert' : 'Request Swap'} <ArrowRight size={16}/></button></footer>{submitted && <div className="rx-confirm">Exchange details captured. Continue to the secure order review.</div>}
    </section>
  </div></div>;
}