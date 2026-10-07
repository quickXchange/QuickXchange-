import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { MessageCircle, ExternalLink, LifeBuoy } from 'lucide-react';
import { useHapticFeedback } from '@/lib/hooks';

export default function Support() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const { supportUrl } = useAuth();
  const haptic = useHapticFeedback();

  const handleOpenSupport = () => {
    haptic.impact('medium');
    const tg = window.Telegram?.WebApp;

    if (supportUrl) {
      if (tg?.openTelegramLink && supportUrl.includes('t.me')) {
        tg.openTelegramLink(supportUrl);
      } else {
        window.open(supportUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="flex flex-col p-4 space-y-6 pt-12 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-md mx-auto w-full pb-20">
      <div className="text-center space-y-4">
        <div className="w-[88px] h-[88px] bg-primary/10 rounded-full mx-auto flex items-center justify-center relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <LifeBuoy className="w-10 h-10 text-primary relative z-10 stroke-[1.5px]" />
        </div>
        <h1 className="text-[26px] font-bold tracking-tight">{uiT("customer.m2bff98865447")}</h1>
        <p className="text-[14px] text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
          {uiT("customer.macd94fcd2325")}{' '}</p>
      </div>

      <div className="premium-card p-6 flex flex-col items-center justify-center space-y-5 surface-animated">
        <p className="text-[13px] font-semibold text-center text-muted-foreground/90 leading-relaxed">
          {uiT("customer.mb70cc089d588")}{' '}</p>
        <Button
          onClick={handleOpenSupport}
          disabled={!supportUrl}
          className="w-full h-[54px] rounded-2xl bg-primary text-primary-foreground font-bold shadow-[0_8px_20px_-8px_hsl(var(--primary))] transition-transform active:scale-95"
        >
          <MessageCircle className="w-[18px] h-[18px] mr-2" />
          {uiT("customer.m87251e43a826")}{' '}</Button>
        {!supportUrl && (
          <p className="text-[12px] text-destructive font-medium">{uiT("customer.mb08205ac2ea3")}</p>
        )}
      </div>
    </div>
  );
}