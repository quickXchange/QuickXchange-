import { ArrowDownUp, ArrowRight, Check, ChevronDown, Clock3, Mail, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import './_group.css';

const surface = { border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' };
const raised = { border: '1px solid hsl(var(--card-border))', background: 'hsl(var(--card))' };

export function StructuralReview() {
  const [mode, setMode] = useState<'swap' | 'convert'>('convert');
  const [fixed, setFixed] = useState(false);
  const [complete, setComplete] = useState(false);
  const converting = mode === 'convert';
  const from = converting ? 'USDT' : 'USD';
  const to = converting ? 'BTC' : 'USDC';
  return <main className="swap-prototype" style={{ minHeight: '100%', padding: '24px 20px 38px' }}>
    <div style={{ width: 'min(100%, 1040px)', margin: 'auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="sp-brand" style={{ margin: 0 }}><span className="sp-brand-mark" />QuickX<b>change</b></div>
        <span className="sp-trust"><ShieldCheck size={14} /> Secure exchange desk</span>
      </header>
      <div className="sr-layout">
        <section className="sp-card sr-main">
          <div className="sr-heading">
            <div><span className="sp-kicker">EXCHANGE ROUTE</span><h1>Choose your route</h1><p>Quote first. Move with clarity.</p></div>
            <div className="sr-tabs" role="tablist">
              <button onClick={() => setMode('swap')} className={!converting ? 'active' : ''}><ShieldCheck size={13} /> Swap</button>
              <button onClick={() => setMode('convert')} className={converting ? 'active' : ''}><Clock3 size={13} /> Convert</button>
            </div>
          </div>
          <div className="sr-flow">
            <AmountBlock label="You send" value={converting ? '1,250' : '2,500'} asset={from} detail={converting ? 'Tether · TRC20' : 'USD · Wise'} />
            <button className="sp-swap" aria-label="Reverse exchange route"><ArrowDownUp size={16} /></button>
            <AmountBlock label="You receive" value={converting ? '0.01864' : '2,471.25'} asset={to} detail={converting ? 'Bitcoin · mainnet' : 'USD Coin · Polygon'} />
          </div>
          <div className="sp-rate sr-quote"><div><span>Quoted rate</span><strong>{converting ? '1 USDT = 0.00001491 BTC' : '1 USD = 0.9885 USDC'}</strong></div><div><span>{converting ? 'Quote expires' : 'Desk response'}</span><strong>{converting ? '02:18' : 'within 15 min'}</strong></div><button><RefreshCw size={12} /> Refresh</button></div>
          {converting ? <div className="sr-condition"><b>Rate mode</b><div><button onClick={() => setFixed(false)} className={!fixed ? 'active' : ''}>Floating <small>market rate</small></button><button onClick={() => setFixed(true)} className={fixed ? 'active' : ''}>Fixed <small>protected quote</small></button></div></div> : <div className="sr-human"><ShieldCheck size={15} /><span><b>Human processed.</b> A settlement specialist verifies your route before funds move.</span></div>}
          <div className="sr-details"><div className="sr-details-title"><span className="sp-kicker">SETTLEMENT DETAILS</span><p>Where we can reach you and safely return funds.</p></div><div className="sr-fields">
            <Field label="Email address" value="marin.cole@example.com" icon={<Mail size={13} />} />
            <Field label="Destination address" value={converting ? 'bc1qsr3...7k4fm2' : '0x9df7...e3d5'} icon={<Wallet size={13} />} mono />
            <Field label="Destination memo" placeholder="Tag or memo if required" optional />
            <Field label="Refund address" value={converting ? 'TQ4xqN...J8T89e' : 'wise:marin.cole'} mono />
          </div></div>
          <footer className="sr-footer"><p>Network fee is included in your quoted receive amount.</p><button className="sp-submit" onClick={() => setComplete(true)}>{converting ? 'Start Convert' : 'Request Swap'} <ArrowRight size={15} /></button></footer>
          {complete && <div className="sp-notice"><Check size={14} /> Details captured. Continue to the secure order review.</div>}
        </section>
        <aside className="sr-aside"><span className="sp-kicker">STRUCTURAL GAINS</span><h2>Why this frame reads faster.</h2><Insight n="01" title="Route before form" body="Asset movement is isolated first, so the customer sees the decision before the paperwork." /><Insight n="02" title="Quote becomes a checkpoint" body="Rate, expiry, and refresh live in one scan line—not buried beneath inputs." /><Insight n="03" title="Conditional complexity" body="Rate choices and human processing appear only when the selected route needs them." /><Insight n="04" title="Commitment has context" body="The final action sits beside the fee promise and settlement reassurance." /></aside>
      </div>
    </div>
    <style>{`.sr-layout{display:grid;grid-template-columns:minmax(0,1fr) 235px;gap:18px}.sr-main{padding:22px}.sr-heading{display:flex;justify-content:space-between;gap:16px;align-items:start}.sr-heading h1{margin:7px 0 0;font:600 clamp(25px,4vw,34px) 'Space Grotesk',sans-serif;letter-spacing:-.06em}.sr-heading p{margin:7px 0 0;color:hsl(var(--muted-foreground));font-size:12px}.sr-tabs{display:flex;gap:2px;padding:4px;border-radius:10px;background:hsl(var(--muted));font-size:11px;font-weight:700}.sr-tabs button{display:flex;align-items:center;gap:5px;border:0;border-radius:7px;padding:9px 11px;background:transparent;color:hsl(var(--muted-foreground));cursor:pointer}.sr-tabs button.active{background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 1px 4px hsl(var(--foreground)/.1)}.sr-flow{display:grid;grid-template-columns:1fr 34px 1fr;align-items:center;gap:7px;margin-top:20px}.sr-flow .sp-amount{margin:0;padding:12px;border:1px solid hsl(var(--input));border-radius:13px;background:hsl(var(--background))}.sr-flow .sp-label{margin-bottom:6px}.sr-flow .sp-amount-row{height:auto;border:0;padding:0;background:transparent}.sr-flow .sp-amount-row input{font-size:19px}.sr-flow .sp-amount:after{content:attr(data-detail)}.sr-quote{margin-top:14px;display:grid;grid-template-columns:1fr 1fr auto;gap:12px}.sr-quote>div{display:grid;gap:4px}.sr-quote>div+div{border-left:1px solid hsl(var(--border));padding-left:12px}.sr-quote button{display:flex;align-items:center;gap:4px}.sr-condition,.sr-human{margin-top:14px;padding:11px 13px;border:1px solid hsl(var(--border));border-radius:11px;font-size:11px}.sr-condition{display:flex;align-items:center;justify-content:space-between;gap:10px}.sr-condition>div{display:flex;padding:2px;border-radius:7px;background:hsl(var(--muted))}.sr-condition button{border:0;border-radius:5px;padding:7px 9px;background:transparent;color:hsl(var(--muted-foreground));font-size:10px;cursor:pointer}.sr-condition button.active{background:hsl(var(--card));color:hsl(var(--foreground));box-shadow:0 1px 3px hsl(var(--foreground)/.1)}.sr-condition small{display:block;font-size:9px}.sr-human{display:flex;gap:8px;background:hsl(var(--info)/.08);color:hsl(var(--info));line-height:1.45}.sr-human b{color:hsl(var(--foreground))}.sr-details{margin-top:18px;border-top:1px solid hsl(var(--border));padding-top:16px}.sr-details-title p{margin:5px 0 11px;color:hsl(var(--muted-foreground));font-size:11px}.sr-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sr-field{display:block}.sr-field>span:first-child{display:flex;gap:5px;margin-bottom:6px;color:hsl(var(--muted-foreground));font-size:10px;font-weight:700}.sr-field em{font-weight:400}.sr-field>span:last-child{display:flex;align-items:center;gap:7px;height:39px;padding:0 10px;border:1px solid hsl(var(--input));border-radius:9px;background:hsl(var(--background))}.sr-field input{width:100%;border:0;outline:0;background:transparent;color:hsl(var(--foreground));font-size:11px}.sr-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}.sr-footer p{margin:0;color:hsl(var(--muted-foreground));font-size:10px}.sr-footer .sp-submit{width:auto;padding:0 18px;margin:0}.sr-aside{padding:18px;border:1px solid hsl(var(--card-border));border-radius:18px;background:hsl(var(--secondary))}.sr-aside h2{margin:7px 0 22px;font:600 20px 'Space Grotesk',sans-serif;letter-spacing:-.05em}.sr-insight{margin-top:16px;border-left:2px solid hsl(var(--primary));padding-left:10px}.sr-insight b{font:700 9px 'JetBrains Mono',monospace;color:hsl(var(--primary))}.sr-insight h3{margin:3px 0 0;font-size:11px}.sr-insight p{margin:4px 0 0;color:hsl(var(--muted-foreground));font-size:10px;line-height:1.45}@media(max-width:700px){.sr-layout{grid-template-columns:1fr}.sr-aside{display:none}}@media(max-width:560px){.sr-heading{display:block}.sr-tabs{margin-top:15px}.sr-flow{grid-template-columns:1fr}.sr-flow .sp-swap{transform:rotate(90deg);margin:-5px auto}.sr-fields{grid-template-columns:1fr}.sr-footer{align-items:stretch;flex-direction:column}.sr-footer .sp-submit{width:100%}}`}</style>
  </main>;
}

function AmountBlock({ label, value, asset, detail }: { label: string; value: string; asset: string; detail: string }) {
  return <label className="sp-amount"><span className="sp-label">{label}</span><span className="sp-amount-row"><input defaultValue={value} aria-label={label} /><button className="sp-asset"><i className="sp-token">{asset[0]}</i>{asset}<ChevronDown size={12} /></button></span><small style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>{detail}</small></label>;
}
function Field({ label, value, placeholder, icon, optional, mono }: { label: string; value?: string; placeholder?: string; icon?: ReactNode; optional?: boolean; mono?: boolean }) {
  return <label className="sr-field"><span>{label}{optional && <em>optional</em>}</span><span>{icon}<input defaultValue={value} placeholder={placeholder} style={mono ? { fontFamily: "'JetBrains Mono', monospace" } : undefined} /></span></label>;
}
function Insight({ n, title, body }: { n: string; title: string; body: string }) {
  return <div className="sr-insight"><b>{n}</b><h3>{title}</h3><p>{body}</p></div>;
}