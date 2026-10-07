import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useAuthHeaders } from '@/lib/auth';
import { useLinkTelegramMiniAppOrder } from '@workspace/api-client-react';
import { useHapticFeedback } from '@/lib/hooks';
import { parseTrackingInput } from '@/lib/tracking-input';

export default function Track() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const [, setLocation] = useLocation();
  const initialTracking = parseTrackingInput(window.location.href);
  const [orderId, setOrderId] = useState(initialTracking.orderId);
  const [trackingToken, setTrackingToken] = useState(initialTracking.trackingToken);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const headers = useAuthHeaders();
  const haptic = useHapticFeedback();
  const linkOrder = useLinkTelegramMiniAppOrder({ request: { headers } });

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim() || !trackingToken.trim()) return;
    
    setError('');
    setIsSearching(true);
    haptic.impact('light');

    try {
      const order = await linkOrder.mutateAsync({
        data: {
          orderId: orderId.trim(),
          trackingToken: trackingToken.trim(),
        },
      });
      haptic.notification('success');
      setLocation(`/orders/${order.id}`);
    } catch (err: any) {
      haptic.notification('error');
      setError("customer.m316975997a13");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col p-4 space-y-6 pt-8 max-w-md mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="text-center space-y-2 mb-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
          <Search className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{uiT("customer.m73a75653065c")}</h1>
        <p className="text-sm text-muted-foreground max-w-[260px] mx-auto">
          {uiT("customer.m58228bcaabdb")}{' '}</p>
      </div>

      <form onSubmit={handleTrack} className="space-y-4">
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider pl-1">
            {uiT("customer.md89d8487ce82")}{' '}</label>
          <Input 
            value={orderId}
            onChange={(e) => {
              const parsed = parseTrackingInput(e.target.value);
              setOrderId(parsed.orderId);
              if (parsed.trackingToken) setTrackingToken(parsed.trackingToken);
            }}
            aria-label={uiT("customer.m4f739a619cb0")}
            placeholder={uiT("customer.m14a2299fa3b3")}
            className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[15px] shadow-inner font-mono"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-muted-foreground/80 uppercase tracking-wider pl-1">
            {uiT("customer.m841b498a58be")}{' '}</label>
          <Input
            value={trackingToken}
            aria-label={uiT("customer.m841b498a58be")}
            onChange={(e) => setTrackingToken(e.target.value)}
            placeholder={uiT("customer.m4872a2e2e81d")}
            className="bg-background/80 h-14 rounded-2xl border-white/10 focus-visible:ring-primary/50 text-[13px] shadow-inner font-mono"
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl font-medium animate-in fade-in">
            {uiText(error)}
          </div>
        )}

        <Button 
          type="submit" 
          disabled={!orderId.trim() || !trackingToken.trim() || isSearching}
          className="w-full h-[56px] rounded-2xl text-[17px] font-bold shadow-[0_8px_20px_-8px_hsl(var(--primary))] transition-transform active:scale-95 disabled:opacity-50"
        >
          {isSearching ? uiT("customer.m78c9d9f6ace0") : uiT("customer.m73a75653065c")}
        </Button>
      </form>
    </div>
  );
}