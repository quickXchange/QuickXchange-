import { useState } from 'react';
import {
  ArrowUpRight, Check, CheckCircle2, CircleDot, ClipboardCheck,
  Copy, FileText, LockKeyhole, Mail, Shield, Timer, X,
} from 'lucide-react';
import '../swap-convert-redesign/_group.css';

type Panel = 'brief' | 'destination' | 'policy';

export function SettlementControlRoom() {
  const [panel, setPanel] = useState<Panel>('brief');
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main className="scr-shell">
      <style>{`
        .scr-shell{--ink:hsl(var(--foreground));--muted:hsl(var(--muted-foreground));--paper:hsl(var(--background));--line:hsl(var(--border));--deep:hsl(var(--sidebar));--coral:hsl(var(--primary));--sun:hsl(var(--secondary));--mint:hsl(var(--success));min-height:100%;padding:22px;background:var(--paper);color:var(--ink);font-family:'Plus Jakarta Sans',sans-serif;box-sizing:border-box}
        .scr-shell *{box-sizing:border-box}.scr-shell button{font:inherit;cursor:pointer}.scr-board{max-width:1180px;margin:auto;min-height:650px;border:1px solid var(--line);background:hsl(var(--card));box-shadow:8px 9px 0 hsl(var(--primary)/.08);display:grid;grid-template-columns:244px minmax(0,1fr);overflow:hidden}
        .scr-rail{background:var(--deep);color:hsl(var(--sidebar-foreground));padding:25px 19px;display:flex;flex-direction:column}.scr-brand{display:flex;align-items:center;gap:9px;font:700 17px 'Space Grotesk',sans-serif;letter-spacing:-.07em}.scr-brandmark{width:25px;height:25px;display:grid;place-items:center;background:var(--sun);color:var(--deep);transform:rotate(45deg)}.scr-brandmark svg{transform:rotate(-45deg)}.scr-brand b{color:var(--sun)}.scr-rail small{font:600 9px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:hsl(var(--sidebar-foreground)/.65)}.scr-case{margin-top:49px}.scr-case h2{font:600 25px/1.03 'Space Grotesk',sans-serif;letter-spacing:-.07em;margin:9px 0 8px}.scr-case p{font-size:10px;line-height:1.6;color:hsl(var(--sidebar-foreground)/.72);margin:0}.scr-nav{margin-top:35px;border-top:1px solid hsl(var(--sidebar-foreground)/.17);padding-top:13px}.scr-nav button{display:flex;width:100%;gap:9px;align-items:center;text-align:left;border:0;border-left:2px solid transparent;background:transparent;color:hsl(var(--sidebar-foreground)/.78);padding:10px 8px;font-size:10px}.scr-nav button.active{color:hsl(var(--sidebar-foreground));background:hsl(var(--sidebar-foreground)/.1);border-left-color:var(--sun)}.scr-nav button svg{width:14px}.scr-operator{margin-top:auto;padding-top:20px;border-top:1px solid hsl(var(--sidebar-foreground)/.17);display:flex;gap:8px;align-items:center}.scr-avatar{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:var(--mint);color:var(--deep);font:bold 10px 'Space Grotesk',sans-serif}.scr-operator b{font-size:10px;display:block}.scr-operator span{font:9px 'JetBrains Mono',monospace;color:hsl(var(--sidebar-foreground)/.65)}
        .scr-work{padding:25px 31px 29px;min-width:0}.scr-worktop{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:19px}.scr-kicker{font:600 10px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:var(--coral);display:flex;align-items:center;gap:7px}.scr-kicker i{width:7px;height:7px;border-radius:50%;background:var(--coral);box-shadow:0 0 0 4px hsl(var(--primary)/.14)}.scr-id{font:600 10px 'JetBrains Mono',monospace;color:var(--muted);padding:7px 9px;border:1px solid var(--line)}
        .scr-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:27px 0 23px}.scr-head h1{font:600 clamp(27px,3vw,39px)/.98 'Space Grotesk',sans-serif;letter-spacing:-.08em;max-width:570px;margin:0}.scr-head p{max-width:218px;font-size:10px;line-height:1.55;color:var(--muted);margin:0}.scr-track{display:grid;grid-template-columns:1fr 1fr 1fr;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.scr-stage{padding:14px 6px 13px;display:flex;gap:8px;align-items:center;border-right:1px solid var(--line);font-size:10px;color:var(--muted)}.scr-stage:last-child{border:0}.scr-stage b{display:block;color:var(--ink);font-size:10px}.scr-stage span{font:9px 'JetBrains Mono',monospace}.scr-stage svg{color:var(--mint);flex:none}.scr-stage.pending svg{color:var(--coral)}
        .scr-main{display:grid;grid-template-columns:minmax(0,1fr) 217px;gap:24px;margin-top:25px}.scr-label{font:700 10px 'JetBrains Mono',monospace;letter-spacing:1px;color:var(--muted);margin-bottom:10px}.scr-receipt{border:1px solid var(--line);border-top:5px solid var(--sun);background:hsl(var(--card));}.scr-rline{display:grid;grid-template-columns:1fr 27px 1fr;padding:18px 17px 16px;align-items:center}.scr-sideamount:last-child{text-align:right}.scr-sideamount small{display:block;color:var(--muted);font-size:9px;margin-bottom:6px}.scr-sideamount b{font:600 21px/1 'JetBrains Mono',monospace;letter-spacing:-.08em}.scr-sideamount span{display:block;font:9px 'JetBrains Mono',monospace;color:var(--muted);margin-top:7px}.scr-arrow{color:var(--coral);text-align:center}.scr-metrics{border-top:1px dashed var(--line);display:grid;grid-template-columns:repeat(3,1fr)}.scr-metrics div{padding:11px 14px;border-right:1px dashed var(--line)}.scr-metrics div:last-child{border:0}.scr-metrics span{display:block;font-size:8px;color:var(--muted);margin-bottom:3px}.scr-metrics b{font-size:9px}.scr-address{margin-top:14px;border:1px solid var(--line);padding:12px 13px;display:flex;align-items:center;gap:10px;background:hsl(var(--muted)/.32)}.scr-address svg{color:var(--deep);flex:none}.scr-address span{min-width:0;flex:1}.scr-address small{display:block;font-size:8px;color:var(--muted);margin-bottom:3px}.scr-address code{font:9px 'JetBrains Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.scr-copy{border:0;background:transparent;color:var(--coral);padding:3px}
        .scr-note{background:var(--deep);color:hsl(var(--sidebar-foreground));padding:18px 16px;align-self:start;position:relative;overflow:hidden}.scr-note:after{content:'✓';position:absolute;right:-10px;bottom:-40px;font:130px 'Space Grotesk',sans-serif;color:hsl(var(--sidebar-foreground)/.06)}.scr-note .scr-label{color:hsl(var(--sidebar-foreground)/.68);position:relative}.scr-note h3{font:600 18px/1.06 'Space Grotesk',sans-serif;letter-spacing:-.06em;margin:8px 0;position:relative}.scr-note p{color:hsl(var(--sidebar-foreground)/.76);font-size:9px;line-height:1.55;margin:0;position:relative}.scr-time{display:flex;gap:7px;align-items:center;font:600 9px 'JetBrains Mono',monospace;color:var(--sun);margin-top:16px;position:relative}
        .scr-confirm{margin-top:21px;border:1px solid hsl(var(--success)/.7);background:hsl(var(--success)/.12);padding:13px;display:flex;gap:11px;align-items:flex-start}.scr-confirm input{accent-color:var(--deep);margin:2px 0 0}.scr-confirm label{font-size:10px;line-height:1.5}.scr-confirm label b{display:block;font-size:10px}.scr-confirm label span{color:var(--muted)}.scr-submit{margin-top:12px;width:100%;border:0;padding:14px;background:var(--coral);color:hsl(var(--primary-foreground));display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:11px;transition:transform .18s ease,background .18s ease}.scr-submit:hover{transform:translateY(-2px);background:hsl(var(--primary)/.86)}.scr-submit:disabled{background:hsl(var(--muted-foreground)/.45);cursor:not-allowed;transform:none}.scr-privacy{display:flex;gap:5px;align-items:center;color:var(--muted);font-size:8px;margin:10px 2px}.scr-privacy svg{width:11px}
        @media(max-width:760px){.scr-shell{padding:12px}.scr-board{display:block}.scr-rail{padding:16px 18px}.scr-case,.scr-nav{display:none}.scr-operator{margin-top:16px;padding-top:12px}.scr-work{padding:21px 18px}.scr-head{display:block}.scr-head p{margin-top:11px}.scr-main{grid-template-columns:1fr}.scr-note{display:none}}@media(max-width:460px){.scr-worktop .scr-id{font-size:8px}.scr-track{grid-template-columns:1fr}.scr-stage{border-right:0;border-bottom:1px solid var(--line)}.scr-stage:last-child{border-bottom:0}.scr-rline{padding:15px 11px}.scr-sideamount b{font-size:15px}.scr-metrics{grid-template-columns:1fr}.scr-metrics div{border-right:0;border-bottom:1px dashed var(--line)}}
      `}</style>
      <section className="scr-board">
        <aside className="scr-rail">
          <div className="scr-brand"><span className="scr-brandmark"><ArrowUpRight size={14}/></span>Quick<b>X</b>change</div>
          <div className="scr-case"><small>SETTLEMENT CASE</small><h2>Route review</h2><p>A focused handoff for higher-confidence transfers.</p></div>
          <nav className="scr-nav" aria-label="Review sections">
            <button className={panel === 'brief' ? 'active' : ''} onClick={() => setPanel('brief')}><ClipboardCheck/> Settlement brief</button>
            <button className={panel === 'destination' ? 'active' : ''} onClick={() => setPanel('destination')}><CircleDot/> Destination check</button>
            <button className={panel === 'policy' ? 'active' : ''} onClick={() => setPanel('policy')}><Shield/> Desk policy</button>
          </nav>
          <div className="scr-operator"><div className="scr-avatar">HM</div><div><b>Human-supervised desk</b><span>REVIEW BEGINS AFTER SUBMISSION</span></div></div>
        </aside>
        <section className="scr-work">
          <div className="scr-worktop"><div className="scr-kicker"><i/> READY FOR YOUR AUTHORIZATION</div><code className="scr-id">CASE QX-8472-MJ</code></div>
          <div className="scr-head"><h1>{panel === 'brief' ? 'Authorize a human review before funds move.' : panel === 'destination' ? 'A quick check on where the USDC lands.' : 'Clear guardrails for an assisted settlement.'}</h1><p>{panel === 'brief' ? 'You stay in control. The desk only sends a payment invitation after confirming this route.' : 'This review creates a clear audit trail and keeps the destination fixed.'}</p></div>
          <div className="scr-track">
            <div className="scr-stage"><CheckCircle2 size={16}/><div><b>Route draft</b><span>NOT SUBMITTED</span></div></div>
            <div className="scr-stage pending"><Timer size={16}/><div><b>Desk review</b><span>YOUR ACTION</span></div></div>
            <div className="scr-stage"><Mail size={16}/><div><b>Payment invite</b><span>AFTER REVIEW</span></div></div>
          </div>
          <div className="scr-main">
            <div>
              <div className="scr-label">{panel === 'brief' ? 'TRANSFER RECEIPT' : panel === 'destination' ? 'FIXED DESTINATION' : 'DESK COMMITMENT'}</div>
              <div className="scr-receipt"><div className="scr-rline"><div className="scr-sideamount"><small>YOU FUND</small><b>2,500.00 USD</b><span>WISE TRANSFER</span></div><div className="scr-arrow"><ArrowUpRight size={18}/></div><div className="scr-sideamount"><small>YOU RECEIVE</small><b>2,471.25 USDC</b><span>POLYGON NETWORK</span></div></div><div className="scr-metrics"><div><span>Indicative rate</span><b>1 USD = 0.9885</b></div><div><span>Network fee</span><b>Included</b></div><div><span>Quote expiry</span><b>15 minutes</b></div></div></div>
              <div className="scr-address"><CircleDot size={15}/><span><small>POLYGON · USDC WALLET</small><code>0x9df7A1bcE382d79F4d9bE2c47baef3d5</code></span><button className="scr-copy" onClick={copyAddress} aria-label="Copy wallet address">{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div>
              <div className="scr-confirm"><input id="route-check" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}/><label htmlFor="route-check"><b>I recognize this destination and settlement amount.</b><span>Authorization asks the desk to check the route; it does not move funds.</span></label></div>
              <button className="scr-submit" disabled={!accepted} onClick={() => setAccepted(false)}>{accepted ? <><FileText size={15}/> Request specialist review <ArrowUpRight size={15}/></> : <><X size={15}/> Confirm route to continue</>}</button>
              <div className="scr-privacy"><LockKeyhole/> Your payment details stay private until a specialist returns the invitation.</div>
            </div>
            <aside className="scr-note"><div className="scr-label">WHAT HAPPENS NEXT</div><h3>A person checks the route.</h3><p>Recipient, network and return path are reviewed together. Any concern pauses the handoff.</p><div className="scr-time"><Timer size={13}/> ESTIMATED REVIEW: ~15 MIN</div></aside>
          </div>
        </section>
      </section>
    </main>
  );
}