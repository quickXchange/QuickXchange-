import { useEffect, useState, memo } from 'react';
import { PublicShell } from '@/components/public-shell';
import { ArrowRight, RefreshCw, ShieldCheck, Zap, HandCoins, Activity, CheckCircle2, ChevronRight, Menu, Wallet, QrCode, Check, Send, Paperclip, Mic } from 'lucide-react';
import { Link } from 'wouter';
import { cn, basePath, TELEGRAM_BOT_URL } from '@/components/shared-app-ui';
import './how-it-works.css';

const MOCKUP_STEP_DURATION = 2000;

const AssetIcon = ({ symbol, color }: { symbol: string, color: string }) => (
  <div className="mockup-asset-icon" style={{ backgroundColor: color }}>
    <span className="text-[10px]">{symbol[0]}</span>
  </div>
);

const SwapMockup = memo(function SwapMockup() {
  const [step, setStep] = useState(1);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    const interval = setInterval(() => {
      setStep(s => (s % 6) + 1);
    }, MOCKUP_STEP_DURATION);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mockup-container">
      <div className="mockup-card">
        <div className="mockup-header">
          <div className="mockup-tabs">
            <div className="mockup-tab active">Swap</div>
            <div className="mockup-tab">Convert</div>
          </div>
          <Menu size={18} className="text-muted-foreground" />
        </div>
        
        <div className="mockup-body">
          {/* Step 1: Choose assets */}
          <div className={cn("mockup-step", step === 1 && "active")}>
            <div className="text-sm font-bold text-foreground mb-4">Choose assets</div>
            <div className="mockup-field">
              <div className="mockup-field-label">You send</div>
              <div className="mockup-asset">
                <AssetIcon symbol="BTC" color="#F7931A" />
                <span>BTC</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </div>
            <div className="flex justify-center -my-3 relative z-10">
              <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground">
                <RefreshCw size={14} />
              </div>
            </div>
            <div className="mockup-field">
              <div className="mockup-field-label">You receive</div>
              <div className="mockup-asset">
                <div className="mockup-asset-icon bg-blue-600 text-[10px] text-white font-bold flex items-center justify-center rounded-full">€</div>
                <span>EUR</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Step 2: Enter amount */}
          <div className={cn("mockup-step", step === 2 && "active")}>
            <div className="text-sm font-bold text-foreground mb-4">Enter amount</div>
            <div className="mockup-field">
              <div>
                <div className="mockup-field-label">You send</div>
                <div className="mockup-field-value text-foreground">0.25</div>
              </div>
              <div className="mockup-asset">
                <AssetIcon symbol="BTC" color="#F7931A" />
                <span>BTC</span>
              </div>
            </div>
            <div className="mockup-field">
              <div>
                <div className="mockup-field-label">You receive</div>
                <div className="mockup-field-value text-foreground">16,420.50</div>
              </div>
              <div className="mockup-asset">
                <div className="mockup-asset-icon bg-blue-600 text-[10px] text-white font-bold flex items-center justify-center rounded-full">€</div>
                <span>EUR</span>
              </div>
            </div>
            <div className="mockup-btn mockup-btn-primary mt-auto">Continue</div>
          </div>

          {/* Step 3: Destination details */}
          <div className={cn("mockup-step", step === 3 && "active")}>
            <div className="flex items-center gap-2 mb-2 text-sm font-bold text-foreground">
              <ShieldCheck size={16} className="text-primary" />
              Receiving Details
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">IBAN Number *</div>
                <div className="h-12 rounded-xl bg-input border border-border px-3 flex items-center">
                  <div className="mockup-skeleton-text medium" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Account Holder *</div>
                <div className="h-12 rounded-xl bg-input border border-border px-3 flex items-center">
                  <div className="mockup-skeleton-text short" />
                </div>
              </div>
            </div>
            <div className="mockup-btn mockup-btn-primary mt-auto">Review Order</div>
          </div>

          {/* Step 4: Review */}
          <div className={cn("mockup-step", step === 4 && "active")}>
            <div className="text-center space-y-1 mb-4">
              <div className="text-sm font-bold text-foreground">Review & Submit</div>
            </div>
            <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Send</span>
                <span className="font-bold text-foreground">0.25 BTC</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Receive</span>
                <span className="font-bold text-foreground">16,420.50 EUR</span>
              </div>
            </div>
            <div className="mockup-btn mockup-btn-primary mt-auto flex justify-center items-center gap-2">
              Place Order <ArrowRight size={16} />
            </div>
          </div>

          {/* Step 5: Send funds */}
          <div className={cn("mockup-step", step === 5 && "active")}>
            <div className="text-center space-y-1 mb-4">
              <div className="text-sm font-bold text-foreground">Send Funds</div>
              <div className="text-[11px] text-muted-foreground">Awaiting deposit</div>
            </div>
            <div className="flex flex-col items-center gap-4 bg-muted/20 p-6 rounded-xl border border-border">
              <div className="w-32 h-32 bg-white rounded-lg flex items-center justify-center border border-border">
                <QrCode size={64} className="text-black" />
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Send exactly</div>
                <div className="font-bold text-xl">0.25 BTC</div>
              </div>
            </div>
          </div>

          {/* Step 6: Completion */}
          <div className={cn("mockup-step", step === 6 && "active")}>
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-success/20 text-success flex items-center justify-center">
                <Check size={32} />
              </div>
              <div>
                <div className="text-xl font-bold mb-2">Order Complete</div>
                <div className="text-muted-foreground text-sm">Your exchange has been processed successfully.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const ConvertMockup = memo(function ConvertMockup() {
  const [step, setStep] = useState(1);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    const interval = setInterval(() => {
      setStep(s => (s % 6) + 1);
    }, MOCKUP_STEP_DURATION);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mockup-container">
      <div className="mockup-card">
        <div className="mockup-header">
          <div className="mockup-tabs">
            <div className="mockup-tab">Swap</div>
            <div className="mockup-tab active">Convert</div>
          </div>
          <div className="text-[11px] font-bold text-primary flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full">
            <Zap size={12} /> Auto
          </div>
        </div>
        
        <div className="mockup-body">
          {/* Step 1: Choose assets */}
          <div className={cn("mockup-step", step === 1 && "active")}>
            <div className="text-sm font-bold text-foreground mb-4">Choose assets</div>
            <div className="mockup-field">
              <div className="mockup-field-label">You send</div>
              <div className="mockup-asset">
                <AssetIcon symbol="USDT" color="#26A17B" />
                <span>USDT</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </div>
            <div className="flex justify-center -my-3 relative z-10">
              <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground">
                <RefreshCw size={14} />
              </div>
            </div>
            <div className="mockup-field">
              <div className="mockup-field-label">You receive</div>
              <div className="mockup-asset">
                <AssetIcon symbol="ETH" color="#627EEA" />
                <span>ETH</span>
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Step 2: Enter amount */}
          <div className={cn("mockup-step", step === 2 && "active")}>
            <div className="text-sm font-bold text-foreground mb-4">Enter amount</div>
            <div className="mockup-field">
              <div>
                <div className="mockup-field-label">You send</div>
                <div className="mockup-field-value text-foreground">1,500</div>
              </div>
              <div className="mockup-asset">
                <AssetIcon symbol="USDT" color="#26A17B" />
                <span>USDT</span>
              </div>
            </div>
            <div className="flex justify-center -my-3 relative z-10">
              <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground">
                <RefreshCw size={14} />
              </div>
            </div>
            <div className="mockup-field">
              <div>
                <div className="mockup-field-label">You receive</div>
                <div className="mockup-field-value text-foreground">0.5824</div>
              </div>
              <div className="mockup-asset">
                <AssetIcon symbol="ETH" color="#627EEA" />
                <span>ETH</span>
              </div>
            </div>
            <div className="mockup-btn mockup-btn-primary mt-auto">Continue</div>
          </div>

          {/* Step 3: Destination address */}
          <div className={cn("mockup-step", step === 3 && "active")}>
            <div className="text-center space-y-1 mb-4">
              <div className="text-sm font-bold text-foreground">Receiving Details</div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Destination Address *</div>
                <div className="h-12 rounded-xl bg-input border border-border px-3 flex items-center gap-2">
                  <Wallet size={16} className="text-muted-foreground" />
                  <div className="mockup-skeleton-text medium" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Refund Address (Optional)</div>
                <div className="h-12 rounded-xl bg-input border border-border px-3 flex items-center gap-2 opacity-50">
                  <Wallet size={16} className="text-muted-foreground" />
                  <div className="mockup-skeleton-text short" />
                </div>
              </div>
            </div>
            <div className="mockup-btn mockup-btn-primary mt-auto">Review</div>
          </div>

          {/* Step 4: Confirm */}
          <div className={cn("mockup-step", step === 4 && "active")}>
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden mb-4">
              <div className="p-3 bg-muted/30 flex items-center justify-center gap-4 border-b border-border">
                <AssetIcon symbol="USDT" color="#26A17B" />
                <ArrowRight size={14} className="text-muted-foreground" />
                <AssetIcon symbol="ETH" color="#627EEA" />
              </div>
              <div className="p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Send</span>
                  <span className="font-bold text-foreground">1,500 USDT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Receive</span>
                  <span className="font-bold text-foreground">0.5824 ETH</span>
                </div>
              </div>
            </div>
            <div className="mockup-btn mockup-btn-primary mt-auto">Place Order</div>
          </div>

          {/* Step 5: Scan QR / Send */}
          <div className={cn("mockup-step", step === 5 && "active")}>
            <div className="text-center space-y-1 mb-4">
              <div className="text-sm font-bold text-foreground">Awaiting Deposit</div>
            </div>
            <div className="flex flex-col items-center gap-4 bg-muted/20 p-6 rounded-xl border border-border">
              <div className="w-32 h-32 bg-white rounded-lg flex items-center justify-center border border-border">
                <QrCode size={64} className="text-black" />
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Send exactly</div>
                <div className="font-bold text-xl">1,500 USDT</div>
              </div>
            </div>
          </div>

          {/* Step 6: Completion */}
          <div className={cn("mockup-step", step === 6 && "active")}>
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-success/20 text-success flex items-center justify-center">
                <Check size={32} />
              </div>
              <div>
                <div className="text-xl font-bold mb-2">Order Complete</div>
                <div className="text-muted-foreground text-sm">Your crypto has been converted and sent.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const TelegramMockup = memo(function TelegramMockup() {
  return (
    <div className="mockup-container">
      <div className="mockup-card" data-testid="telegram-mockup">

        {/* Phone Header */}
        <div className="relative flex items-center justify-between border-b border-border bg-[#54a9eb] px-4 py-3 dark:border-white/5 dark:bg-[#1e293b]/90 dark:backdrop-blur-md">
          <div className="flex items-center gap-3">
            <ArrowRight size={18} className="rotate-180 text-white" />
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white flex items-center justify-center shadow-sm">
              <Send size={18} className="text-[#54a9eb] dark:text-[#1e293b]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold leading-tight text-white">QuickXchangeBot</span>
              <span className="text-[12px] leading-tight text-blue-100 dark:text-blue-300/80">bot</span>
            </div>
          </div>
        </div>

        {/* Chat Body */}
        <div className="mockup-body !p-0 bg-[#e3ebe8] dark:bg-[#0f172a] relative overflow-hidden flex flex-col">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
            style={{
              backgroundImage: 'radial-gradient(circle at center, currentColor 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              color: 'black'
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 hidden opacity-[0.02] dark:block"
            style={{
              backgroundImage: 'radial-gradient(circle at center, currentColor 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              color: 'white'
            }}
          />

          <div className="flex-1 p-4 relative">
            {/* Step 1: Start */}
            <div className="mockup-step telegram-mockup-step telegram-mockup-step--1 !inset-4">
              <div className="bg-white dark:bg-[#1e293b] p-3 rounded-2xl rounded-tl-sm text-[13px] text-slate-800 dark:text-white shadow-sm w-[85%]">
                Welcome to QuickXchange. Press Start to open the bot menu.
              </div>
              <div className="mt-auto grid grid-cols-1 pb-2">
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[13px] font-bold text-slate-800 dark:text-white shadow-sm">Start</div>
              </div>
            </div>

            {/* Step 2: Exchange options */}
            <div className="mockup-step telegram-mockup-step telegram-mockup-step--2 !inset-4">
              <div className="bg-[#eef2ff] dark:bg-[#3b82f6]/20 p-3 rounded-2xl rounded-tr-sm text-[13px] text-slate-800 dark:text-white shadow-sm ml-auto w-fit">
                Exchange
              </div>
              <div className="bg-white dark:bg-[#1e293b] p-3 rounded-2xl rounded-tl-sm text-[13px] text-slate-800 dark:text-white shadow-sm w-[85%] mt-2">
                Choose what you send and receive.
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2 pb-2">
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[12px] font-bold text-slate-800 dark:text-white shadow-sm">You Send · BTC</div>
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[12px] font-bold text-slate-800 dark:text-white shadow-sm">You Receive · EUR</div>
              </div>
            </div>

            {/* Step 3: Details */}
            <div className="mockup-step telegram-mockup-step telegram-mockup-step--3 !inset-4">
              <div className="bg-white dark:bg-[#1e293b] p-3 rounded-2xl rounded-tl-sm text-[13px] text-slate-800 dark:text-white shadow-sm w-[85%]">
                Enter the amount and required order details.
              </div>
              <div className="bg-[#eef2ff] dark:bg-[#3b82f6]/20 p-3 rounded-2xl rounded-tr-sm text-[13px] text-slate-800 dark:text-white shadow-sm ml-auto w-fit mt-2">
                0.25 BTC
              </div>
              <div className="mt-auto bg-white/50 dark:bg-black/20 rounded-xl p-3 border border-black/5 dark:border-white/5 text-[12px] text-center text-slate-500 dark:text-slate-400 mb-2">
                Receiving details saved
              </div>
            </div>

            {/* Step 4: Review */}
            <div className="mockup-step telegram-mockup-step telegram-mockup-step--4 !inset-4">
              <div className="bg-white dark:bg-[#1e293b] p-3 rounded-2xl rounded-tl-sm text-[13px] text-slate-800 dark:text-white shadow-sm w-[85%]">
                Review your order before confirming.
              </div>
              <div className="rounded-xl border border-black/5 bg-white/80 p-3 text-[12px] text-slate-700 shadow-sm dark:border-white/5 dark:bg-[#1e293b] dark:text-slate-200">
                <div className="flex justify-between gap-4"><span>Send</span><strong>0.25 BTC</strong></div>
                <div className="mt-2 flex justify-between gap-4"><span>Receive</span><strong>≈ 16,420.50 EUR</strong></div>
                <div className="mt-2 flex justify-between gap-4"><span>Rate</span><strong>Live rate</strong></div>
              </div>
              <div className="mt-auto grid grid-cols-1 pb-2">
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[13px] font-bold text-slate-800 dark:text-white shadow-sm">Place Order</div>
              </div>
            </div>

            {/* Step 5: Pay */}
            <div className="mockup-step telegram-mockup-step telegram-mockup-step--5 !inset-4">
              <div className="bg-white dark:bg-[#1e293b] p-3 rounded-2xl rounded-tl-sm text-[13px] text-slate-800 dark:text-white shadow-sm w-[85%]">
                Order created. Open Pay Now and follow the payment instructions.
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2 pb-2">
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[13px] font-bold text-slate-800 dark:text-white shadow-sm">Pay Now</div>
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[13px] font-bold text-slate-800 dark:text-white shadow-sm">Mark as Paid</div>
              </div>
            </div>

            {/* Step 6: Track */}
            <div className="mockup-step telegram-mockup-step telegram-mockup-step--6 !inset-4">
              <div className="bg-white dark:bg-[#1e293b] p-3 rounded-2xl rounded-tl-sm text-[13px] text-slate-800 dark:text-white shadow-sm w-[85%]">
                Track the same live order status in Telegram.
              </div>
              <div className="rounded-xl border border-black/5 bg-white/80 p-3 text-[12px] text-slate-700 shadow-sm dark:border-white/5 dark:bg-[#1e293b] dark:text-slate-200">
                <div>Awaiting Funds</div>
                <div className="my-1 text-primary">↓</div>
                <div>Deposit Received</div>
                <div className="my-1 text-primary">↓</div>
                <div>Processing</div>
                <div className="my-1 text-primary">↓</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">Completed</div>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2 pb-2">
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[13px] font-bold text-slate-800 dark:text-white shadow-sm">Track Order</div>
                <div className="bg-[#c5d0db] dark:bg-[#334155] rounded-xl py-2 px-3 text-center text-[13px] font-bold text-slate-800 dark:text-white shadow-sm">My Orders</div>
              </div>
            </div>

          </div>

          {/* Input Area */}
          <div className="flex items-center gap-3 border-t border-black/5 bg-[#f1f5f9] px-4 py-3 dark:border-white/5 dark:bg-[#1e293b] shrink-0">
            <Paperclip size={20} className="text-slate-500 dark:text-slate-400" />
            <div className="flex-1 text-[14px] text-slate-500 dark:text-slate-400">Message</div>
            <Mic size={20} className="text-slate-500 dark:text-slate-400" />
          </div>
        </div>

      </div>
    </div>
  );
});

export function HowItWorksPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "How QuickXchange Works | QuickXchange";
    const metaDesc = document.querySelector('meta[name="description"]');
    const previousDescription = metaDesc?.getAttribute("content") ?? null;
    if (metaDesc) {
      metaDesc.setAttribute("content", "Swap or convert crypto in a few simple steps.");
    }
    return () => {
      document.title = previousTitle;
      if (!metaDesc) return;
      if (previousDescription === null) metaDesc.removeAttribute("content");
      else metaDesc.setAttribute("content", previousDescription);
    };
  }, []);

  return (
    <PublicShell>
      <div className="w-full bg-background min-h-screen pb-24">
        
        {/* Hero Section */}
        <section className="pt-16 pb-10 px-3 sm:px-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight text-foreground">
              How QuickXchange Works
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Swap or convert crypto in a few simple steps.
            </p>
          </div>
        </section>

        {/* Detailed Demos & Comparison */}
        <section className="py-16 px-3 sm:px-6 max-w-6xl mx-auto">
          {/* Swap Section */}
          <div className="hiw-flow-section hiw-flow-section--swap grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-24">
            <div className="order-2 lg:order-1">
              <SwapMockup />
            </div>
            <div className="order-1 lg:order-2 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-bold tracking-wide uppercase">
                <ShieldCheck size={16} /> Curated Routes
              </div>
              <h2 className="text-3xl md:text-4xl font-bold">Swap</h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Use Swap when exchanging crypto with one of our supported payment methods or routes. Select your pair, review the details, submit your order, and track it until completion.
              </p>
              <div className="pt-6">
                <a href={`${basePath}/swap#exchange-widget`} className="button button-primary rounded-full h-14 px-10 font-bold text-[16px] inline-flex items-center gap-2">
                  Start Swap <ArrowRight size={18} />
                </a>
              </div>
            </div>
          </div>

          {/* Convert Section */}
          <div className="hiw-flow-section hiw-flow-section--convert grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-24">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-bold tracking-wide uppercase">
                <Zap size={16} /> Automated
              </div>
              <h2 className="text-3xl md:text-4xl font-bold">Convert</h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Convert lets you exchange one cryptocurrency for another using a simple automated flow. Choose your assets, enter the amount, send your crypto, and complete the conversion.
              </p>
              <div className="pt-6">
                <a href={`${basePath}/convert#exchange-widget`} className="button button-primary rounded-full h-14 px-10 font-bold text-[16px] inline-flex items-center gap-2">
                  Start Convert <ArrowRight size={18} />
                </a>
              </div>
            </div>
            <div>
              <ConvertMockup />
            </div>
          </div>
          
          {/* Telegram Bot Section */}
          <div id="telegram-bot" className="hiw-flow-section hiw-flow-section--telegram scroll-mt-24 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-24">
            <div className="order-2 lg:order-1">
              <TelegramMockup />
            </div>
            <div className="order-1 lg:order-2 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-bold tracking-wide uppercase">
                <Send size={16} /> Telegram Bot
              </div>
              <h2 className="text-3xl md:text-4xl font-bold" data-testid="text-telegram-how-it-works-title">
                Exchange with QuickXchange on Telegram
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed" data-testid="text-telegram-how-it-works-subtitle">
                Swap, track and manage your orders directly from Telegram.
              </p>

              <ol className="space-y-4 py-4" data-testid="list-telegram-how-it-works-steps">
                {[
                  {
                    title: 'Open QuickXchange Bot',
                    description: 'Open the official QuickXchange Telegram Bot and press Start.',
                  },
                  {
                    title: 'Choose Exchange',
                    description: 'Tap Exchange, then select your You Send and You Receive options.',
                  },
                  {
                    title: 'Enter the Details',
                    description: 'Enter the amount and required order information.',
                  },
                  {
                    title: 'Place Order',
                    description: 'Review the exchange rate and order details, then confirm the order.',
                  },
                  {
                    title: 'Pay & Confirm',
                    description: 'Open Pay Now, follow the payment instructions and use Mark as Paid after sending the payment when applicable.',
                  },
                  {
                    title: 'Track Your Order',
                    description: 'Use Track Order or My Orders to follow the same live order status: Awaiting Funds → Deposit Received → Processing → Completed',
                  },
                ].map((item, index) => (
                  <li key={item.title} className="flex items-start gap-4" data-testid={`item-telegram-step-${index + 1}`}>
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold border border-primary/20">
                      {index + 1}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <h3 className="font-bold text-foreground">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="bg-muted/40 border border-border p-4 rounded-2xl flex items-start gap-3 mt-4">
                <div className="mt-0.5 text-primary"><Send size={18} /></div>
                <div className="text-sm text-muted-foreground" data-testid="text-telegram-support-note">
                  <strong className="text-foreground block mb-1">Support in Telegram</strong>
                  Access Support directly from the bot whenever you need help with an exchange or order.
                </div>
              </div>

              <div className="pt-4">
                <a
                  data-testid="link-telegram-bot-cta"
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button-primary rounded-full h-14 px-8 font-bold text-[16px] inline-flex items-center gap-2"
                >
                  Open Telegram Bot <ArrowRight size={18} />
                </a>
              </div>
            </div>
          </div>

          {/* Compact Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
            <div className="hiw-comparison-card hiw-comparison-card--swap bg-muted/30 border border-border p-8 rounded-3xl">
              <h3 className="text-xl font-bold mb-4">Swap</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={20} />
                  <span className="text-foreground">Crypto ↔ payment method / supported route</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={20} />
                  <span className="text-foreground">Manual/order-based flow</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={20} />
                  <span className="text-foreground">Trackable order status</span>
                </li>
              </ul>
            </div>
            
            <div className="hiw-comparison-card hiw-comparison-card--convert bg-muted/30 border border-border p-8 rounded-3xl">
              <h3 className="text-xl font-bold mb-4">Convert</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={20} />
                  <span className="text-foreground">Crypto ↔ crypto</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={20} />
                  <span className="text-foreground">Faster automated flow</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={20} />
                  <span className="text-foreground">Deposit address + QR</span>
                </li>
              </ul>
            </div>

          </div>
        </section>

        {/* Unified 3 Steps */}
        <section className="py-16 px-3 sm:px-6 max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold">Three Simple Steps</h2>
          </div>
          
          <div className="hiw-steps-grid grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hiw-steps-connector hidden md:block absolute top-12 left-1/6 right-1/6 h-px bg-border border-dashed border-t-2" />
            
            <div className="hiw-step-card hiw-step-card--one bg-card border border-border p-8 rounded-3xl relative z-10 shadow-sm flex flex-col items-center text-center">
              <div className="hiw-step-indicator w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                <RefreshCw size={28} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-bold mb-3">Choose</h3>
              <p className="text-muted-foreground">Select Swap or Convert and choose your assets.</p>
            </div>
            
            <div className="hiw-step-card hiw-step-card--two bg-card border border-border p-8 rounded-3xl relative z-10 shadow-sm flex flex-col items-center text-center">
              <div className="hiw-step-indicator w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                <HandCoins size={28} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-bold mb-3">Send</h3>
              <p className="text-muted-foreground">Enter the amount and follow the payment/deposit instructions.</p>
            </div>
            
            <div className="hiw-step-card hiw-step-card--three bg-card border border-border p-8 rounded-3xl relative z-10 shadow-sm flex flex-col items-center text-center">
              <div className="hiw-step-indicator w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                <Activity size={28} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-bold mb-3">Receive</h3>
              <p className="text-muted-foreground">Track the order and receive your funds.</p>
            </div>
          </div>
        </section>

      </div>
    </PublicShell>
  );
}
