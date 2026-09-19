import { useState } from 'react';
import { useAuth, useAuthHeaders } from '@/lib/auth';
import { Link } from 'wouter';
import { User, Shield, Link2, CheckCircle2, Loader2, ListOrdered, LifeBuoy, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreateTelegramMiniAppAccountLink } from '@workspace/api-client-react';
import { useHapticFeedback } from '@/lib/hooks';

export default function Account() {
  const { user, linkedAccount } = useAuth();
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const [isLinking, setIsLinking] = useState(false);

  const createLink = useCreateTelegramMiniAppAccountLink({ request: { headers } });

  const handleLinkAccount = async (intent: 'signin' | 'signup') => {
    haptic.impact('medium');
    setIsLinking(true);
    try {
      const result = await createLink.mutateAsync({
        data: { intent }
      });
      const tg = window.Telegram?.WebApp;
      const url = window.location.origin + result.relativeUrl;

      if (tg?.openLink) {
        tg.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      haptic.notification('error');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="flex flex-col p-4 space-y-6 pt-12 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-md mx-auto w-full pb-24">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-[26px] font-bold tracking-tight">Account</h1>
      </div>

      <div className="premium-card p-6 flex flex-col items-center justify-center space-y-4 surface-animated">
        <div className="w-[80px] h-[80px] rounded-full bg-primary/10 flex items-center justify-center relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt="Profile" className="w-[72px] h-[72px] rounded-full object-cover relative z-10 border-2 border-background" />
          ) : (
            <User className="w-[32px] h-[32px] text-primary relative z-10 stroke-[1.5px]" />
          )}
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-[20px] font-bold tracking-tight">{user?.firstName} {user?.lastName}</h2>
          {user?.username && <p className="text-[14px] text-muted-foreground font-medium">@{user.username}</p>}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
          QuickXchange Account
        </h3>

        {linkedAccount ? (
          <div className="premium-card p-5 space-y-4 border border-primary/20 bg-primary/5">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-[16px] tracking-tight">Connected ✓</p>
                <p className="text-[13px] font-medium text-muted-foreground">
                  Verified account
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="premium-card p-5 space-y-5">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                <Shield className="w-[22px] h-[22px]" />
              </div>
              <div>
                <p className="font-bold text-[16px] tracking-tight">Link QuickXchange Account</p>
                <p className="text-[13px] font-medium text-muted-foreground">
                  Anonymous session
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Link your QuickXchange account to manage your orders securely across platforms.
              </p>

              <div className="flex gap-3">
                <Button
                  onClick={() => handleLinkAccount('signin')}
                  disabled={isLinking}
                  className="flex-1 h-[48px] rounded-xl bg-primary text-primary-foreground font-bold shadow-[0_4px_14px_-6px_hsl(var(--primary))] active:scale-95 transition-transform"
                >
                  {isLinking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log In'}
                </Button>
                <Button
                  onClick={() => handleLinkAccount('signup')}
                  disabled={isLinking}
                  variant="secondary"
                  className="flex-1 h-[48px] rounded-xl font-bold bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-foreground"
                >
                  Create Account
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="premium-card overflow-hidden mt-4">
          <Link href="/orders" onClick={() => haptic.selection()}>
            <div className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50">
              <div className="flex items-center space-x-3 text-foreground">
                <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <span className="font-bold text-[15px]">My Orders</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </div>
          </Link>
          <Link href="/support" onClick={() => haptic.selection()}>
            <div className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer">
              <div className="flex items-center space-x-3 text-foreground">
                <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <span className="font-bold text-[15px]">Support</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}