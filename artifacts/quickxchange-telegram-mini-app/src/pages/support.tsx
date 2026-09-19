import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { MessageCircle, ExternalLink, LifeBuoy } from 'lucide-react';
import { useHapticFeedback } from '@/lib/hooks';

export default function Support() {
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
        <h1 className="text-[26px] font-bold tracking-tight">24/7 Support</h1>
        <p className="text-[14px] text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
          Need help with an order or have questions about QuickXchange? Our team is here to help.
        </p>
      </div>

      <div className="premium-card p-6 flex flex-col items-center justify-center space-y-5 surface-animated">
        <p className="text-[13px] font-semibold text-center text-muted-foreground/90 leading-relaxed">
          Tap below to open a direct chat with our support team in Telegram.
        </p>
        <Button
          onClick={handleOpenSupport}
          disabled={!supportUrl}
          className="w-full h-[54px] rounded-2xl bg-primary text-primary-foreground font-bold shadow-[0_8px_20px_-8px_hsl(var(--primary))] transition-transform active:scale-95"
        >
          <MessageCircle className="w-[18px] h-[18px] mr-2" />
          Chat with Support
        </Button>
        {!supportUrl && (
          <p className="text-[12px] text-destructive font-medium">Support URL not configured.</p>
        )}
      </div>
    </div>
  );
}