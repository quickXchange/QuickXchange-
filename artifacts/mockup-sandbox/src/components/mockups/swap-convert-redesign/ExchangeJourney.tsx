import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import './_group.css';

type Mode = 'swap' | 'convert';

const stages = [
  { number: '01', label: 'Route' },
  { number: '02', label: 'Amount' },
  { number: '03', label: 'Destination' },
  { number: '04', label: 'Confirm' },
];

export function ExchangeJourney() {
  const [mode, setMode] = useState<Mode>('swap');
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('2,500');
  const [email, setEmail] = useState('marin.cole@example.com');
  const [address, setAddress] = useState('0x9df7...e3d5');
  const [quoteCount, setQuoteCount] = useState(1);
  const [prepared, setPrepared] = useState(false);
  const automatic = mode === 'convert';
  const quote = useMemo(() => ({
    from: automatic ? 'USDT' : 'USD',
    to: automatic ? 'BTC' : 'USDC',
    receive: automatic ? '0.01864' : '2,471.25',
    rate: automatic ? '1 USDT = 0.00001491 BTC' : '1 USD = 0.9885 USDC',
  }), [automatic]);

  const chooseMode = (next: Mode) => {
    setMode(next);
    setStep(0);
    setPrepared(false);
    setAddress(next === 'convert' ? 'bc1qsr3...7k4fm2' : '0x9df7...e3d5');
  };

  const advance = () => {
    if (step === stages.length - 1) setPrepared(true);
    else setStep((current) => current + 1);
  };

  return (
    <main className="swap-prototype min-h-[100dvh] !bg-[hsl(var(--background))] !px-4 !py-5 sm:!px-8 sm:!py-9" style={{ fontFamily: "'Plus Jakarta Sans'" }}>
      <div className="mx-auto max-w-[1040px]">
        <nav className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
          <div className="flex items-center gap-2.5 font-bold tracking-[-.07em] text-[hsl(var(--foreground))]">
            <span className="grid h-8 w-8 place-items-center bg-[hsl(var(--primary))] text-base text-[hsl(var(--primary-foreground))]">Q</span>
            <span className="text-lg">QuickX<span className="font-medium text-[hsl(var(--muted-foreground))]">change</span></span>
          </div>
          <div className="hidden items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))] sm:flex"><ShieldCheck size={15} className="text-[hsl(var(--primary))]" /> Protected exchange</div>
          <ShieldCheck size={18} className="text-[hsl(var(--primary))] sm:hidden" />
        </nav>

        <div className="mt-6 grid overflow-hidden border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--card))] shadow-[8px_8px_0_hsl(var(--sidebar))] lg:grid-cols-[270px_1fr]">
          <aside className="border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] p-6 text-[hsl(var(--sidebar-foreground))] lg:border-b-0 lg:border-r">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">Exchange desk / guided</p>
            <h1 className="mt-5 max-w-[190px] text-[42px] font-semibold leading-[.88] tracking-[-.07em]" style={{ fontFamily: "'Space Grotesk'" }}>One decision at a time.</h1>
            <p className="mt-5 max-w-[205px] text-sm leading-6 text-[hsl(var(--muted))]">Walk your funds through a clearly marked route. No crowded forms. No skipped checks.</p>
            <div className="mt-8 grid gap-2">
              <button onClick={() => chooseMode('swap')} className={`flex items-center justify-between border px-3 py-3 text-left text-sm font-bold transition ${!automatic ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]'}`}><span>Swap</span><span className="font-mono text-[9px] tracking-widest">DESK</span></button>
              <button onClick={() => chooseMode('convert')} className={`flex items-center justify-between border px-3 py-3 text-left text-sm font-bold transition ${automatic ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]'}`}><span>Convert</span><span className="font-mono text-[9px] tracking-widest">AUTO</span></button>
            </div>
            <div className="mt-9 border-t border-[hsl(var(--sidebar-border))] pt-5 font-mono text-[10px] uppercase tracking-[.13em] text-[hsl(var(--muted))]"><span className="text-[hsl(var(--primary))]">Your pace,</span><br />every detail checked.</div>
          </aside>

          <section className="min-w-0 p-5 sm:p-8 lg:p-10">
            <header className="flex flex-col gap-5 border-b border-[hsl(var(--border))] pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">{automatic ? 'Automatic conversion' : 'Human-processed swap'}</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-.06em] sm:text-4xl" style={{ fontFamily: "'Space Grotesk'" }}>{prepared ? 'Review request prepared.' : step === 0 ? 'Where are we headed?' : stages[step].label}</h2>
              </div>
              <span className="w-fit bg-[hsl(var(--secondary))] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[.11em] text-[hsl(var(--foreground))]">{automatic ? 'Automatic provider quote' : 'Estimated review ~15 min'}</span>
            </header>

            <div className="my-7 grid grid-cols-4 gap-1.5">
              {stages.map((stage, index) => <button key={stage.label} onClick={() => !prepared && index <= step && setStep(index)} className={`group relative text-left ${index <= step ? 'cursor-pointer' : 'cursor-default'}`} aria-label={`Stage ${stage.number}: ${stage.label}`}>
                <span className={`mb-2 block h-2 w-full ${index <= step ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`} />
                <span className={`font-mono text-[9px] font-bold tracking-[.1em] ${index === step ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{stage.number}</span>
                <span className={`ml-1 hidden text-xs font-bold sm:inline ${index === step ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{stage.label}</span>
              </button>)}
            </div>

            {!prepared && <div className="min-h-[245px]">
              {step === 0 && <div>
                <p className="max-w-[520px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">Pick the service that fits this transfer. You can switch routes before reviewing.</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button onClick={() => chooseMode('swap')} className={`border p-5 text-left transition ${!automatic ? 'border-[hsl(var(--foreground))] bg-[hsl(var(--secondary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}><WalletCards size={20} className="mb-8 text-[hsl(var(--primary))]" /><p className="text-lg font-bold">Swap at the desk</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">A specialist reviews your route and settlement.</p></button>
                  <button onClick={() => chooseMode('convert')} className={`border p-5 text-left transition ${automatic ? 'border-[hsl(var(--foreground))] bg-[hsl(var(--secondary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}><Sparkles size={20} className="mb-8 text-[hsl(var(--primary))]" /><p className="text-lg font-bold">Convert automatically</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Review an automatic provider quote before production submission.</p></button>
                </div>
              </div>}

              {step === 1 && <div>
                <label className="block border border-[hsl(var(--card-border))] bg-[hsl(var(--input))] p-5 sm:p-6"><span className="font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">You send</span><span className="mt-9 flex items-end justify-between gap-3"><input value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0 w-full bg-transparent font-mono text-4xl font-semibold tracking-[-.07em] text-[hsl(var(--foreground))] outline-none sm:text-5xl" aria-label="Amount to send" /><button className="mb-1 flex items-center gap-1 border-l border-[hsl(var(--border))] pl-3 font-mono text-base font-bold text-[hsl(var(--foreground))]">{quote.from}<ChevronDown size={16} /></button></span></label>
                <div className="flex items-center justify-between gap-3 bg-[hsl(var(--muted))] px-4 py-3 font-mono text-[11px] text-[hsl(var(--muted-foreground))]"><span>Displayed quote <strong className="text-[hsl(var(--foreground))]">{quote.rate}</strong></span><button onClick={() => setQuoteCount((value) => value + 1)} className="flex shrink-0 items-center gap-1 font-bold text-[hsl(var(--primary))] underline underline-offset-2"><RefreshCw size={12} /> Refresh #{quoteCount}</button></div>
                <div className="mt-5 flex items-center justify-between border-b border-[hsl(var(--border))] pb-3"><span className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">You receive</span><strong className="font-mono text-2xl tracking-[-.05em]">{quote.receive} {quote.to}</strong></div>
              </div>}

              {step === 2 && <div>
                <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">This is where we plan to deliver {quote.to}. Check every character before you continue.</p>
                <label className="block"><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Destination address</span><span className="flex border border-[hsl(var(--card-border))] bg-[hsl(var(--input))]"><input value={address} onChange={(event) => setAddress(event.target.value)} className="min-w-0 w-full bg-transparent p-4 font-mono text-sm text-[hsl(var(--foreground))] outline-none" aria-label="Destination address" /><button onClick={() => navigator.clipboard?.writeText(address)} className="border-l border-[hsl(var(--border))] px-4 text-[hsl(var(--muted-foreground))]" aria-label="Copy destination address"><Copy size={16} /></button></span></label>
                <label className="mt-5 block"><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Order email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="w-full border-b border-[hsl(var(--input))] bg-transparent py-3 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]" aria-label="Order email" /></label>
                <p className="mt-5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><LockKeyhole size={14} className="text-[hsl(var(--info))]" /> Details are shown here for prototype review only.</p>
              </div>}

              {step === 3 && <div className="border border-[hsl(var(--card-border))]">
                <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4"><span className="font-mono text-[10px] font-bold uppercase tracking-[.17em]">Your route, in brief</span><ShieldCheck size={19} className="text-[hsl(var(--primary))]" /></div>
                <dl className="grid divide-y divide-[hsl(var(--border))] p-4 text-sm"><div className="flex justify-between py-3"><dt className="text-[hsl(var(--muted-foreground))]">Send</dt><dd className="font-mono font-bold">{amount} {quote.from}</dd></div><div className="flex justify-between py-3"><dt className="text-[hsl(var(--muted-foreground))]">Receive</dt><dd className="font-mono font-bold">{quote.receive} {quote.to}</dd></div><div className="flex justify-between gap-5 py-3"><dt className="text-[hsl(var(--muted-foreground))]">To</dt><dd className="font-mono text-xs font-bold">{address}</dd></div><div className="flex justify-between py-3"><dt className="text-[hsl(var(--muted-foreground))]">Route</dt><dd className="font-bold">{automatic ? 'Automatic provider quote' : 'Human desk review'}</dd></div></dl>
              </div>}
            </div>}

            {prepared && <div className="min-h-[245px] border border-[hsl(var(--success))] bg-[hsl(var(--success)/.1)] p-6 sm:p-8"><div className="grid h-11 w-11 place-items-center bg-[hsl(var(--success))] text-[hsl(var(--primary-foreground))]"><Check size={23} strokeWidth={3} /></div><h3 className="mt-6 text-3xl font-semibold tracking-[-.06em]" style={{ fontFamily: "'Space Grotesk'" }}>Review request prepared.</h3><p className="mt-3 max-w-[460px] text-sm leading-6 text-[hsl(var(--muted-foreground))]">This prototype has prepared the details for review. In production, the next action will submit your {automatic ? 'automatic conversion request' : 'swap request'}; no request has been submitted here.</p><button onClick={() => { setStep(0); setPrepared(false); }} className="mt-7 border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-bold text-[hsl(var(--foreground))]">Start another route</button></div>}

            {!prepared && <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-[hsl(var(--border))] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={() => step > 0 && setStep((current) => current - 1)} disabled={step === 0} className="flex items-center justify-center gap-2 px-2 py-3 text-sm font-bold text-[hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-30"><ArrowLeft size={16} /> Back</button>
              <button onClick={advance} className="flex items-center justify-center gap-2 bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] transition hover:opacity-90">{step === 3 ? 'Prepare review request' : 'Continue'} <ArrowRight size={16} /></button>
            </footer>}
          </section>
        </div>
      </div>
    </main>
  );
}