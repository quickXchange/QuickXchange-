import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { createTelegramMiniAppSession } from '@workspace/api-client-react';
import type { WebApp } from '@/lib/telegram';
import { clearTelegramSession, createIdempotentSessionExpiry, registerSessionExpiryHandler } from '@/lib/session-expiry';

const TELEGRAM_INITIALIZATION_TIMEOUT_MS = 4_000;
const TELEGRAM_INITIALIZATION_POLL_MS = 50;

const delay = (milliseconds: number, signal: AbortSignal) => new Promise<boolean>(resolve => {
  if (signal.aborted) {
    resolve(false);
    return;
  }
  const timeout = window.setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve(true);
  }, milliseconds);
  const onAbort = () => {
    window.clearTimeout(timeout);
    resolve(false);
  };
  signal.addEventListener('abort', onAbort, { once: true });
});

async function initializeTelegramWebApp(signal: AbortSignal): Promise<WebApp | undefined> {
  const deadline = Date.now() + TELEGRAM_INITIALIZATION_TIMEOUT_MS;
  let webApp: WebApp | undefined;
  let webAppReady = false;

  while (Date.now() < deadline) {
    if (signal.aborted) return undefined;
    webApp = window.Telegram?.WebApp;
    if (webApp && !webAppReady) {
      webApp.ready();
      webApp.expand();
      webAppReady = true;
    }
    if (webApp?.initData) return webApp;
    if (!(await delay(TELEGRAM_INITIALIZATION_POLL_MS, signal))) return undefined;
  }

  return webApp;
}

function safeDiagnosticHeader(value: unknown, fallback = 'unknown') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 80);
  return normalized || fallback;
}

interface AuthContextType {
  sessionToken: string | null;
  user: any | null;
  supportUrl: string | null;
  linkedAccount: any | null;
  isLoading: boolean;
  expireSession: () => void;
}

const AuthContext = createContext<AuthContextType>({
  sessionToken: null,
  user: null,
  supportUrl: null,
  linkedAccount: null,
  isLoading: true,
  expireSession: () => undefined,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => sessionStorage.getItem('tg_session_token'));
  const [user, setUser] = useState<any | null>(null);
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [linkedAccount, setLinkedAccount] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const expiryRef = useRef<ReturnType<typeof createIdempotentSessionExpiry> | undefined>(undefined);

  const expireSession = useCallback(() => {
    setSessionToken(null);
    setUser(null);
    setSupportUrl(null);
    setLinkedAccount(null);
    clearTelegramSession(sessionStorage);
  }, []);

  if (!expiryRef.current) {
    expiryRef.current = createIdempotentSessionExpiry(expireSession);
  }

  useEffect(() => {
    const unregister = registerSessionExpiryHandler(() => expiryRef.current?.expire());
    return unregister;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const init = async () => {
      const tg = await initializeTelegramWebApp(controller.signal);
      if (!mounted) return;
      if (tg) {
        // Sync theme
        if (tg.colorScheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }

      const initData = tg?.initData ?? '';
      const initDataUnsafe = tg?.initDataUnsafe;
      if (!initData) {
        expireSession();
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const session = await createTelegramMiniAppSession(
          { initData },
          {
            headers: {
              'X-Telegram-WebApp-Detected': tg ? 'yes' : 'no',
              'X-Telegram-InitData-Present': initData ? 'yes' : 'no',
              'X-Telegram-Unsafe-User-Present': initDataUnsafe?.user ? 'yes' : 'no',
              'X-Telegram-WebApp-Platform': safeDiagnosticHeader(tg?.platform),
              'X-Telegram-WebApp-Version': safeDiagnosticHeader(tg?.version),
              'X-Frontend-Build-Id': safeDiagnosticHeader(__APP_BUILD_ID__),
            },
            signal: controller.signal,
          },
        );
        expiryRef.current?.reset();
        setSessionToken(session.token);
        setUser(session.user);
        setSupportUrl(session.supportUrl || null);
        setLinkedAccount(session.linkedAccount || null);
        sessionStorage.setItem('tg_session_token', session.token);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to create session', err);
        // Fail closed
        expireSession();
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    init();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [expireSession]);

  return (
    <AuthContext.Provider value={{ sessionToken, user, supportUrl, linkedAccount, isLoading, expireSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthHeaders(): Record<string, string> {
  const { sessionToken } = useAuth();
  if (!sessionToken) return {};
  return { Authorization: `Bearer ${sessionToken}` };
}