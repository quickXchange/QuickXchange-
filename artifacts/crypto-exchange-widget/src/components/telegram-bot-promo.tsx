import { ArrowRight, ArrowUpRight, Send, Zap, Package, FileText, User, PenTool, Globe, MessageSquare, Paperclip, Smile, Mic, Bell, RefreshCw, Rocket, Headphones } from 'lucide-react';
import { basePath, TELEGRAM_BOT_URL, TELEGRAM_MINI_APP_DEEP_LINK } from '@/components/shared-app-ui';
import { TelegramMiniAppShowcase } from '@/components/telegram-mini-app-showcase';

export function TelegramBotPromo() {
  return (
    <section className="qx-telegram-promo" aria-label="QuickXchange on Telegram">
      <header className="qx-telegram-heading">
        <p>QUICKXCHANGE / TELEGRAM ECOSYSTEM</p>
        <span>Two ways to exchange. One place to stay connected.</span>
      </header>
      <div className="qx-telegram-grid">
        <article className="qx-telegram-card" aria-labelledby="qx-telegram-bot-title">
          <div className="qx-telegram-card-inner">
          <div className="qx-telegram-badge">
            <Send size={13} aria-hidden="true" />
            TELEGRAM BOT
          </div>
          <h2 className="qx-telegram-title" id="qx-telegram-bot-title">
            Exchange right in <span>Telegram</span>
          </h2>
          <p className="qx-telegram-description">
            Exchange crypto, create and track orders, and get support directly from Telegram — fast, simple and always connected to QuickXchange.
          </p>
          <div className="qx-telegram-feature-heading">Everything in one place</div>
          <ul className="qx-telegram-features">
            {[
              { icon: Zap, text: 'Instant rates' },
              { icon: Package, text: 'Create & track orders' },
              { icon: Bell, text: 'Order notifications' },
              { icon: RefreshCw, text: 'Same rates as the website' },
              { icon: Headphones, text: '24/7 support' },
              { icon: Rocket, text: 'Fast and easy' },
            ].map((benefit) => (
              <li key={benefit.text} className="qx-telegram-feature">
                <span className="qx-telegram-feature-icon"><benefit.icon size={14} aria-hidden="true" /></span>
                <span>{benefit.text}</span>
              </li>
            ))}
          </ul>

        {/* Original Telegram conversation, retained as an illustrative static preview. */}
        <figure className="qx-telegram-phone-stage" aria-label="Illustrative preview of the QuickXchange Telegram Bot conversation">
          <div className="qx-telegram-phone-shell">
          <div className="qx-telegram-phone-edge pointer-events-none absolute -inset-[3px] z-[5]" />

          {/* Phone Body */}
          <div className="qx-telegram-phone relative z-10 flex h-[640px] w-full flex-col overflow-hidden border-[8px] border-slate-800 bg-white ring-1 ring-cyan-300/60 dark:border-slate-900 dark:bg-[#020617] dark:ring-cyan-400/35 sm:h-[680px]" aria-hidden="true">
            
            {/* Dynamic Island / Notch */}
            <div className="absolute left-1/2 top-0 z-50 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-800 dark:bg-slate-900" />
            
            {/* Telegram Header */}
            <div className="qx-telegram-bot-header relative flex items-center justify-between border-b border-black/5 bg-[#54a9eb] px-4 pb-3 pt-10 dark:border-white/5 dark:bg-[#1e293b]/90 dark:backdrop-blur-md">
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
              <div className="qx-telegram-bot-menu relative z-10 mt-2 grid grid-cols-2 gap-2">
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
                  <div key={i} className="flex h-11 w-full items-center gap-2.5 rounded-xl bg-[#c5d0db] px-3 font-semibold text-slate-800 dark:bg-[#1e293b] dark:text-white dark:shadow-sm dark:ring-1 dark:ring-white/5">
                    <span className="text-base leading-none">{btn.emoji}</span>
                    <span className="text-[14px]">{btn.label}</span>
                  </div>
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
          <div className="qx-telegram-phone-glow pointer-events-none absolute z-0" />
          </div>
          <figcaption className="qx-telegram-phone-caption">Illustrative preview · chat with the bot</figcaption>
        </figure>
          <div className="qx-telegram-actions">
            <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="qx-telegram-cta" data-testid="link-open-telegram-bot">
              <span>✈️ Open the Bot</span><ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <span className="qx-mini-actions-note">Opens in Telegram</span>
          </div>
        </div>
        </article>
        <TelegramMiniAppShowcase miniAppHref={TELEGRAM_MINI_APP_DEEP_LINK} />
      </div>
    </section>
  );
}
