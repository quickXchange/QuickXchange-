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
        'exchange-information-card relative mx-auto mt-5 h-auto w-full max-w-none px-1 py-4 sm:px-2 sm:py-5',
        glow && 'drop-shadow-[0_8px_22px_rgba(37,140,255,0.12)]',
      )}
      aria-label={config.title || 'Exchange information'}
      data-testid="exchange-information-card"
    >
      <div className="relative h-auto text-foreground">
        <div className={cn(
          'flex min-w-0 items-center gap-3',
          textAlign === 'center' && 'justify-center',
          textAlign === 'right' && 'justify-end',
        )}>
          {showIcon && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/20 via-blue-500/20 to-violet-500/20 text-primary">
              <ShieldCheck size={19} aria-hidden="true" />
            </span>
          )}
          {config.title && (
            <h2 className="min-w-0 text-balance text-base font-bold tracking-tight text-foreground sm:text-lg">
              {config.title}
            </h2>
          )}
        </div>
        <p className={cn(
          'mt-3 min-w-0 whitespace-normal break-words leading-[1.75] text-foreground/75',
          textAlign === 'center' && 'text-center',
          textAlign === 'right' && 'text-right',
          config.textSize === 'medium' ? 'text-[15px] sm:text-base' : config.textSize === 'large' ? 'text-base sm:text-[17px]' : 'text-sm sm:text-[15px]',
        )}>
          {config.text}
        </p>
      </div>
    </aside>
  );
}