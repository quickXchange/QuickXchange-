import { ArrowRight, Check, ChevronDown, Copy, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import './_group.css';

export function ExchangeRailway() {
  const [mode, setMode] = useState<'swap' | 'convert'>('swap');
  const [quote, setQuote] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const automatic = mode === 'convert';
  const from = automatic ? 'USDT' : 'USD';
  const to = automatic ? 'BTC' : 'USDC';
  const receive = automatic ? '0.01864' : '2,471.25';

  return (
    <main className="swap-prototype min-h-[100dvh] !p-5 sm:!px-8 sm:!py-10 [--sidebar:var(--foreground)] [--sidebar-foreground:var(--primary-foreground)] [--sidebar-border:var(--muted-foreground)]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="mx-auto max-w-[1120px]">
        <nav className="mb-7 flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
          <div className="flex items-center gap-2 text-[16px] font-bold tracking-[-0.06em]">
            <span className="grid h-7 w-7 place-items-center bg-[hsl(var(--primary))] text-[14px] text-[hsl(var(--primary-foreground))]">Q</span>
            QuickX<span className="font-medium text-[hsl(var(--muted-foreground))]">change</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]"><ShieldCheck size={14} className="text-[hsl(var(--primary))]" /> Guarded desk</div>
        </nav>

        <div className="grid gap-0 overflow-hidden border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--card))] shadow-[8px_8px_0_hsl(var(--sidebar))] lg:grid-cols-[290px_1fr]">
          <aside className="flex flex-col bg-[hsl(var(--sidebar))] p-6 text-[hsl(var(--sidebar-foreground))] sm:p-8">
            <p className="mb-10 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">Exchange desk / 04</p>
            <h1 className="max-w-[210px] text-4xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-5xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Take the clear route.</h1>
            <p className="mt-5 max-w-[210px] text-sm leading-6 text-[hsl(var(--muted))]">A direct order trail from your balance to the destination you name.</p>
            <div className="mt-10 border-t border-[hsl(var(--sidebar-border))] pt-5">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--muted))]">Service</p>
              <div className="grid gap-2">
                <button onClick={() => { setMode('swap'); setSubmitted(false); }} className={`flex items-center justify-between border px-3 py-3 text-left text-sm font-bold transition ${!automatic ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]'}`}><span>Swap</span><span className="font-mono text-[10px] font-medium">DESK</span></button>
                <button onClick={() => { setMode('convert'); setSubmitted(false); }} className={`flex items-center justify-between border px-3 py-3 text-left text-sm font-bold transition ${automatic ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]'}`}><span>Convert</span><span className="font-mono text-[10px] font-medium">AUTO</span></button>
              </div>
            </div>
            <div className="mt-auto pt-12 text-xs leading-5 text-[hsl(var(--muted))]"><span className="mb-2 block font-mono text-[10px] tracking-widest text-[hsl(var(--primary))]">01—02—03</span>Quote, review, settle. Nothing hides between steps.</div>
          </aside>

          <section className="bg-[hsl(var(--card))] p-5 sm:p-8 lg:p-10">
            <header className="flex flex-col justify-between gap-4 border-b border-[hsl(var(--border))] pb-6 sm:flex-row sm:items-end">
              <div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{automatic ? 'Automatic conversion' : 'Human-processed swap'}</p><h2 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Build your order</h2></div>
              <span className="w-fit bg-[hsl(var(--secondary))] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--foreground))]">{automatic ? 'Market route live' : 'Estimated review ~15 min'}</span>
            </header>
            <div className="py-7">
              <div className="grid gap-3 md:grid-cols-[1fr_42px_1fr] md:items-stretch">
                <label className="border border-[hsl(var(--card-border))] bg-[hsl(var(--input))] p-4"><span className="mb-7 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">You send</span><span className="flex items-end justify-between gap-2"><input className="min-w-0 w-full bg-transparent font-mono text-3xl font-semibold tracking-[-0.06em] text-[hsl(var(--foreground))] outline-none" defaultValue={automatic ? '1,250' : '2,500'} aria-label="Amount to send" /><button className="flex shrink-0 items-center gap-1 border-l border-[hsl(var(--border))] pl-3 font-mono text-sm font-bold text-[hsl(var(--foreground))]">{from}<ChevronDown size={13} /></button></span></label>
                <div className="grid place-items-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><ArrowRight size={19} className="rotate-90 md:rotate-0" /></div>
                <label className="border border-[hsl(var(--card-border))] bg-[hsl(var(--input))] p-4"><span className="mb-7 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">You receive</span><span className="flex items-end justify-between gap-2"><input className="min-w-0 w-full bg-transparent font-mono text-3xl font-semibold tracking-[-0.06em] text-[hsl(var(--foreground))] outline-none" value={receive} readOnly aria-label="Amount to receive" /><button className="flex shrink-0 items-center gap-1 border-l border-[hsl(var(--border))] pl-3 font-mono text-sm font-bold text-[hsl(var(--foreground))]">{to}<ChevronDown size={13} /></button></span></label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 bg-[hsl(var(--muted))] px-3 py-2 font-mono text-[11px] text-[hsl(var(--muted-foreground))]"><span>Displayed quote: <strong className="text-[hsl(var(--foreground))]">{automatic ? '1 USDT = 0.00001491 BTC' : '1 USD = 0.9885 USDC'}</strong></span><button onClick={() => setQuote((value) => value + 1)} className="flex items-center gap-1 font-bold text-[hsl(var(--primary))] underline underline-offset-2"><RefreshCw size={12} /> Refresh #{quote}</button></div>
            </div>
            <div className="grid gap-x-5 gap-y-5 border-t border-[hsl(var(--border))] pt-6 md:grid-cols-2">
              <label className="md:col-span-2"><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Order email</span><input className="w-full border-b border-[hsl(var(--input))] bg-transparent py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]" type="email" defaultValue="marin.cole@example.com" /></label>
              <label><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Destination address</span><span className="flex border-b border-[hsl(var(--input))]"><input className="w-full bg-transparent py-2 font-mono text-xs text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]" defaultValue={automatic ? 'bc1qsr3...7k4fm2' : '0x9df7...e3d5'} /><button className="text-[hsl(var(--muted-foreground))]" aria-label="Copy destination address" onClick={() => navigator.clipboard?.writeText(automatic ? 'bc1qsr3...7k4fm2' : '0x9df7...e3d5')}><Copy size={14}/></button></span></label>
              <label><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Refund address</span><input className="w-full border-b border-[hsl(var(--input))] bg-transparent py-2 font-mono text-xs text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]" defaultValue={automatic ? 'TQ4xqN...J8T89e' : 'wise:marin.cole'} /></label>
              <label><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Destination memo <i className="normal-case text-[hsl(var(--muted-foreground))]">(optional)</i></span><input className="w-full border-b border-[hsl(var(--input))] bg-transparent py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]" placeholder="Add a tag if required" /></label>
              <label><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Refund memo <i className="normal-case text-[hsl(var(--muted-foreground))]">(optional)</i></span><input className="w-full border-b border-[hsl(var(--input))] bg-transparent py-2 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]" placeholder="Add a tag if required" /></label>
            </div>
            <footer className="mt-8 flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Zap size={14} className="text-[hsl(var(--info))]" /> {automatic ? 'Automatic provider at displayed quote' : 'Desk review based on the displayed quote'}</p><button onClick={() => setSubmitted(true)} className="flex items-center justify-center gap-2 bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] transition hover:opacity-90">{automatic ? 'Start convert' : 'Request swap'} <ArrowRight size={16}/></button></footer>
            {submitted && <div className="mt-4 flex items-center gap-2 border border-[hsl(var(--success))] bg-[hsl(var(--success)/.1)] px-3 py-3 text-sm font-semibold text-[hsl(var(--success))]"><Check size={16}/> Your {automatic ? 'conversion' : 'swap request'} is ready to review.</div>}
          </section>
        </div>
      </div>
    </main>
  );
}