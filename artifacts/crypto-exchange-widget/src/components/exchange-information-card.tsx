import { ShieldCheck } from 'lucide-react';
import { cn } from '@/components/shared-app-ui';

type ExchangeInformationContent = {
  visible?: boolean;
  showIcon?: boolean;
  glow?: boolean;
  title?: string;
  text?: string;
  textSize?: 'small' | 'medium' | 'large';
  textAlign?: 'left' | 'center' | 'right';
};

export const DEFAULT_EXCHANGE_INFORMATION_CONTENT: ExchangeInformationContent = {
  glow: true,
  text: 'Exchanges are processed automatically with AML verification. The exchange rate is based on real-time spot market data and is floating, meaning it is calculated at the moment of processing according to current market conditions. The transaction requires network confirmations depending on the cryptocurrency and network. After the required confirmations are received, processing begins and may take up to 10 additional minutes. The final amount may vary depending on market fluctuations.',
  title: 'Exchange Information',
  visible: true,
  showIcon: true,
  textSize: 'small',
  textAlign: 'left',
};

function parseContent(value: Record<string, unknown> | undefined): ExchangeInformationContent {
  if (!value) return DEFAULT_EXCHANGE_INFORMATION_CONTENT;
  return {
    visible: typeof value.visible === 'boolean' ? value.visible : undefined,
    showIcon: typeof value.showIcon === 'boolean' ? value.showIcon : undefined,
    glow: typeof value.glow === 'boolean' ? value.glow : undefined,
    title: typeof value.title === 'string' ? value.title.trim() : undefined,
    text: typeof value.text === 'string' ? value.text.trim() : undefined,
    textSize: value.textSize === 'small' || value.textSize === 'medium' || value.textSize === 'large'
      ? value.textSize
      : undefined,
    textAlign: value.textAlign === 'left' || value.textAlign === 'center' || value.textAlign === 'right'
      ? value.textAlign
      : undefined,
  };
}

export function ExchangeInformationCard({ content }: { content?: Record<string, unknown> }) {
  const config = parseContent(content);
  if (config.visible === false || !config.text) return null;

  const showIcon = config.showIcon !== false;
  const glow = config.glow !== false;
  const textAlign = config.textAlign ?? 'left';

  return (
    <aside
      className={cn(
        'exchange-information-card relative mx-auto mt-4 h-auto w-full max-w-none overflow-hidden rounded-2xl p-px',
        glow && 'shadow-[0_10px_32px_rgba(37,140,255,0.12),0_0_24px_rgba(124,58,237,0.12)]',
      )}
      aria-label={config.title || 'Exchange information'}
      data-testid="exchange-information-card"
    >
      <div className={cn(
        'absolute inset-0 bg-gradient-to-r from-cyan-400/65 via-blue-500/70 to-violet-500/65',
        !glow && 'opacity-45',
      )} aria-hidden="true" />
      <div className="relative h-auto rounded-[calc(1rem-1px)] bg-card/95 px-5 py-5 text-card-foreground shadow-[inset_0_0_24px_rgba(34,211,238,0.06)] backdrop-blur-sm sm:px-6 sm:py-5">
        <div className={cn(
          'flex min-w-0 items-center gap-3',
          textAlign === 'center' && 'justify-center',
          textAlign === 'right' && 'justify-end',
        )}>
          {showIcon && (
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/15 via-blue-500/15 to-violet-500/15 text-primary ring-1 ring-primary/15">
              <ShieldCheck size={17} aria-hidden="true" />
            </span>
          )}
          {config.title && (
            <h2 className="min-w-0 text-balance text-sm font-bold tracking-tight text-foreground sm:text-[15px]">
              {config.title}
            </h2>
          )}
        </div>
        <p className={cn(
          'mt-3 min-w-0 whitespace-normal break-words leading-[1.7] text-muted-foreground',
          textAlign === 'center' && 'text-center',
          textAlign === 'right' && 'text-right',
          config.textSize === 'medium' ? 'text-sm sm:text-[15px]' : config.textSize === 'large' ? 'text-[15px] sm:text-base' : 'text-xs sm:text-[13px]',
        )}>
          {config.text}
        </p>
      </div>
    </aside>
  );
}