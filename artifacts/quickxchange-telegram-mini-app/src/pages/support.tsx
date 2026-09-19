import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { useHapticFeedback } from '@/lib/hooks';

export default function Support() {
  const { user } = useAuth();
  const haptic = useHapticFeedback();

  const handleOpenSupport = () => {
    haptic.impact('medium');
    const tg = window.Telegram?.WebApp;
    // Fallback support username or from env
    const supportUsername = 'quickxchange_support'; 
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/${supportUsername}`);
    } else {
      window.open(`https://t.me/${supportUsername}`, '_blank');
    }
  };

  return (
    <div className="flex flex-col p-4 space-y-6 pt-10">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-primary/10 rounded-full mx-auto flex items-center justify-center">
          <MessageCircle className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">24/7 Support</h1>
        <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
          Need help with an order or have questions about QuickXchange? Our team is here to help.
        </p>
      </div>

      <div className="premium-card p-6 flex flex-col items-center justify-center space-y-4">
        <p className="text-sm font-medium text-center">
          Tap below to open a direct chat with our support team in Telegram.
        </p>
        <Button 
          onClick={handleOpenSupport}
          className="w-full rounded-xl h-12 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Chat with Support
        </Button>
      </div>
    </div>
  );
}
