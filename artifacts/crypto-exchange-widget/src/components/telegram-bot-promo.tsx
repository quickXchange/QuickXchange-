import { ArrowRight, Send, Zap, Package, FileText, User, PenTool, Globe, MessageSquare, Paperclip, Smile, Mic, Bell, RefreshCw, Rocket, Headphones } from 'lucide-react';
import { basePath } from '@/components/shared-app-ui';

export function TelegramBotPromo() {
  return (
    <section className="qx-telegram-promo relative mx-auto mb-16 mt-8 w-[calc(100%-2rem)] max-w-[1440px] overflow-hidden rounded-[2.5rem] border border-blue-200/50 bg-gradient-to-br from-blue-50/80 via-white to-purple-50/80 p-8 shadow-2xl dark:border-blue-500/20 dark:from-[#080d19] dark:via-[#0a1128] dark:to-[#110e26] md:p-16 lg:p-20">
      {/* Decorative luminous background depth */}
      <div className="pointer-events-none absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-blue-400/20 blur-[100px] dark:bg-blue-600/10" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full bg-purple-400/20 blur-[120px] dark:bg-purple-600/10" />
      
      {/* Optional floating Telegram planes in background */}
      <div className="pointer-events-none absolute left-[50%] top-[10%] opacity-20 dark:opacity-10 motion-safe:animate-[pulse_4s_ease-in-out_infinite]">
        <Send size={48} className="-rotate-12 text-blue-500" />
      </div>
      <div className="pointer-events-none absolute bottom-[20%] left-[5%] opacity-30 dark:opacity-10 motion-safe:animate-[bounce_6s_ease-in-out_infinite]">
        <Send size={64} className="rotate-12 text-purple-500" />
      </div>

      <div className="relative z-10 grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Left Content */}
        <div className="flex flex-col text-left">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full bg-blue-100/80 px-4 py-1.5 text-sm font-bold tracking-wide text-blue-700 shadow-sm ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
            <Send size={14} className="-ml-0.5" />
            TELEGRAM BOT
          </div>
          
          <h2 className="mb-6 text-4xl font-extrabold tracking-tight text-foreground md:text-5xl lg:text-6xl lg:leading-[1.1]">
            Exchange right in <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Telegram</span>
          </h2>
          
          <p className="mb-10 text-lg leading-relaxed text-muted-foreground md:text-xl">
            Exchange crypto, create and track orders, and get support directly from Telegram — fast, simple and always connected to QuickXchange.
          </p>

          <div className="mb-12 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            {[
              { icon: Zap, text: 'Instant rates' },
              { icon: Package, text: 'Create & track orders' },
              { icon: Bell, text: 'Order notifications' },
              { icon: RefreshCw, text: 'Same rates as the website' },
              { icon: Headphones, text: '24/7 support' },
              { icon: Rocket, text: 'Fast and easy' },
            ].map((benefit, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-md">
                  <benefit.icon size={16} />
                </div>
                <span className="font-semibold text-foreground">{benefit.text}</span>
              </div>
            ))}
          </div>

          <a 
            href="https://t.me/QuickXchangeNetBot"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex h-14 w-fit items-center justify-center gap-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 px-8 font-bold text-white shadow-[0_10px_30px_rgba(59,130,246,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(59,130,246,0.4)]"
          >
            <span className="text-lg">✈️ Open the Bot</span>
          </a>
        </div>

        {/* Right Phone Mockup */}
        <div className="relative mx-auto w-full max-w-[360px] lg:ml-auto">
          <div className="qx-telegram-phone-edge pointer-events-none absolute -inset-[3px] z-[5] rounded-[2.7rem] sm:rounded-[3.2rem]" />

          {/* Phone Body */}
          <div className="qx-telegram-phone relative z-10 flex h-[640px] w-full flex-col overflow-hidden rounded-[2.5rem] border-[8px] border-slate-800 bg-white ring-1 ring-cyan-300/60 dark:border-slate-900 dark:bg-[#020617] dark:ring-cyan-400/35 sm:h-[680px] sm:rounded-[3rem]">
            
            {/* Dynamic Island / Notch */}
            <div className="absolute left-1/2 top-0 z-50 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-800 dark:bg-slate-900" />
            
            {/* Telegram Header */}
            <div className="relative flex items-center justify-between border-b border-black/5 bg-[#54a9eb] px-4 pb-3 pt-10 dark:border-white/5 dark:bg-[#1e293b]/90 dark:backdrop-blur-md">
              <div className="flex items-center gap-3">
                <ArrowRight size={20} className="rotate-180 text-white" />
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full shadow-sm">
                  <img
                    src={`${basePath}/brand/quickxchange-telegram-bot-logo.jpg`}
                    alt="QuickXchange"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[15px] font-bold leading-tight text-white">QuickXchangeBot</span>
                  <span className="text-[13px] leading-tight text-blue-100 dark:text-blue-300/80">bot</span>
                </div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-white">
                <Globe size={18} />
              </div>
            </div>

            {/* Chat Area */}
            <div className="relative flex-1 overflow-hidden bg-[#e3ebe8] p-4 dark:bg-[#0f172a]">
              {/* Telegram-like chat background pattern */}
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
              
              {/* Bot Message Bubble */}
              <div className="relative z-10 mb-4 mr-8 rounded-2xl rounded-tl-sm bg-white p-3.5 text-[15px] text-slate-800 shadow-sm dark:bg-[#1e293b] dark:text-white dark:ring-1 dark:ring-white/5">
                <p className="mb-2">👋 Welcome to QuickXchange!</p>
                <p>Exchange crypto, track orders and get support — all in Telegram.</p>
                <span className="mt-1 block text-right text-[11px] text-slate-400">19:41</span>
              </div>

              {/* Bot Menu Grid */}
              <div className="relative z-10 mt-2 grid grid-cols-2 gap-2">
                {[
                  { icon: Zap, label: 'Exchange', emoji: '⚡' },
                  { icon: Package, label: 'Track Order', emoji: '📦' },
                  { icon: FileText, label: 'My Orders', emoji: '📋' },
                  { icon: User, label: 'Sign In', emoji: '👤' },
                  { icon: PenTool, label: 'Sign Up', emoji: '📝' },
                  { icon: Globe, label: 'Language', emoji: '🌐' },
                  { icon: MessageSquare, label: 'Support', emoji: '💬' },
                  { icon: Globe, label: 'Website', emoji: '🌍' },
                ].map((btn, i) => (
                  <button key={i} className="flex h-11 w-full items-center gap-2.5 rounded-xl bg-[#c5d0db] px-3 font-semibold text-slate-800 transition-colors hover:bg-[#b0bdc9] dark:bg-[#1e293b] dark:text-white dark:shadow-sm dark:ring-1 dark:ring-white/5 dark:hover:bg-[#334155]">
                    <span className="text-base leading-none">{btn.emoji}</span>
                    <span className="text-[14px]">{btn.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div className="flex items-center gap-3 border-t border-black/5 bg-[#f1f5f9] px-4 py-3 dark:border-white/5 dark:bg-[#1e293b]">
              <Paperclip size={24} className="text-slate-500 dark:text-slate-400" />
              <div className="flex-1 text-[16px] text-slate-500 dark:text-slate-400">Message</div>
              <Smile size={24} className="text-slate-500 dark:text-slate-400" />
              <Mic size={24} className="text-slate-500 dark:text-slate-400" />
            </div>

          </div>
          
          {/* Subtle phone shadow/glow */}
          <div className="qx-telegram-phone-glow pointer-events-none absolute -inset-8 z-0 rounded-[4rem] bg-gradient-to-b from-cyan-400/30 via-blue-500/30 to-purple-600/35 blur-3xl dark:from-cyan-400/25 dark:via-blue-500/30 dark:to-purple-500/40" />
        </div>
      </div>
    </section>
  );
}
