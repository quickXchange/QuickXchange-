import { useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import { CheckCircle2, CircleAlert, Link2, Loader2, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { PublicShell } from '@/components/public-shell';
import { basePath } from '@/components/shared-app-ui';

type LinkState = 'loading' | 'success' | 'error';

type ApiFailure = {
  code?: string;
  error?: string;
  message?: string;
};

function connectError(responseStatus: number, payload: ApiFailure | null): string {
  const code = `${payload?.code ?? ''} ${payload?.error ?? ''} ${payload?.message ?? ''}`.toLowerCase();
  if (responseStatus === 409 || code.includes('conflict') || code.includes('already_link')) {
    return 'This Telegram account is already connected to another QuickXchange account. If you believe this is a mistake, contact QuickXchange support.';
  }
  if (responseStatus === 404 || responseStatus === 410 || code.includes('expired') || code.includes('invalid') || code.includes('used') || code.includes('consumed')) {
    return 'This Telegram connection link has expired or has already been used. Please request a new link from Telegram.';
  }
  if (responseStatus === 401 || responseStatus === 403) {
    return 'Your session could not be verified. Please sign in again and open the connection link from Telegram.';
  }
  return 'We could not connect Telegram right now. Please request a new link from Telegram and try again.';
}

function ConnectCard({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <main className="public-main flex min-h-[60vh] min-w-0 items-center justify-center overflow-x-hidden px-4 py-12 sm:px-6 sm:py-20 rise-in">
        <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-10" aria-live="polite">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Link2 size={22} aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">QuickXchange</p>
              <h1 className="text-xl font-bold text-foreground">Connect Telegram</h1>
            </div>
          </div>
          {children}
        </section>
      </main>
    </PublicShell>
  );
}

export function TelegramConnectPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<LinkState>('loading');
  const [error, setError] = useState('');
  const consumed = useRef(false);
  const connectUrl = useMemo(() => `${window.location.pathname}${window.location.search}`, []);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get('token');
  const intent = params.get('intent');
  const authRedirect = connectUrl;
  const authRedirected = useRef(false);

  useEffect(() => {
    if (!isLoaded || isSignedIn || !token || authRedirected.current) return;
    authRedirected.current = true;
    const authRoute = intent === 'signup' || intent === 'sign-up' || intent === 'register' ? '/sign-up' : '/sign-in';
    setLocation(`${authRoute}?redirect_url=${encodeURIComponent(authRedirect)}`);
  }, [authRedirect, intent, isLoaded, isSignedIn, setLocation, token]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || consumed.current) return;
    consumed.current = true;
    let cancelled = false;
    void (async () => {
      try {
        // The token is sent once over same-origin cookie-authenticated transport.
        const response = await fetch(`${basePath}/api/telegram/connect`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        let payload: ApiFailure | null = null;
        try {
          payload = await response.json() as ApiFailure;
        } catch {
          // Empty responses are valid for a successful link.
        }
        if (!response.ok) throw Object.assign(new Error('Telegram link request failed'), { status: response.status, payload });
        if (!cancelled) setState('success');
      } catch (caught) {
        if (!cancelled) {
          const failure = caught as { status?: number; payload?: ApiFailure };
          setError(connectError(failure.status ?? 0, failure.payload ?? null));
          setState('error');
        }
      } finally {
        // Do not leave a one-time credential in browser history or the address bar.
        if (!cancelled) {
          const safeUrl = new URL(window.location.href);
          safeUrl.searchParams.delete('token');
          window.history.replaceState({}, '', safeUrl.toString());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, token]);

  if (!isLoaded) {
    return <ConnectCard><LoadingState /></ConnectCard>;
  }

  if (!token) {
    return <ConnectCard><ErrorState title="Connection link unavailable" message="This Telegram connection link is missing its token. Please request a new link from Telegram." /></ConnectCard>;
  }
  if (!isSignedIn) {
    return (
      <ConnectCard><LoadingState /></ConnectCard>
    );
  }
  if (state === 'loading') return <ConnectCard><LoadingState /></ConnectCard>;
  if (state === 'error') {
    return <ConnectCard><div className="space-y-5"><CircleAlert className="text-destructive" size={38} /><h2 className="text-2xl font-bold">Telegram was not connected</h2><p className="text-muted-foreground">{error}</p><p className="text-sm text-muted-foreground">For your security, the connection token was not displayed.</p></div></ConnectCard>;
  }
  return <ConnectCard><div className="space-y-5"><CheckCircle2 className="text-emerald-500" size={42} /><h2 className="text-2xl font-bold">Telegram connected</h2><p className="text-muted-foreground">Your QuickXchange account is now connected to Telegram. You may return to Telegram to continue.</p><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck size={16} />Your connection is secured by your signed-in session.</div></div></ConnectCard>;
}

function LoadingState() {
  return <div className="flex flex-col items-center gap-4 py-8 text-center"><Loader2 className="animate-spin text-primary" size={38} aria-hidden="true" /><h2 className="text-xl font-semibold">Connecting Telegram…</h2><p className="text-muted-foreground">We’re securely linking your account. This will only take a moment.</p></div>;
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return <div className="space-y-4"><CircleAlert className="text-destructive" size={38} /><h2 className="text-2xl font-bold">{title}</h2><p className="text-muted-foreground">{message}</p></div>;
}