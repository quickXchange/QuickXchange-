import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createTelegramMiniAppSession } from '@workspace/api-client-react';

interface AuthContextType {
  sessionToken: string | null;
  user: any | null;
  supportUrl: string | null;
  linkedAccount: any | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  sessionToken: null,
  user: null,
  supportUrl: null,
  linkedAccount: null,
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => sessionStorage.getItem('tg_session_token'));
  const [user, setUser] = useState<any | null>(null);
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [linkedAccount, setLinkedAccount] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        
        // Sync theme
        if (tg.colorScheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }

      const initData = tg?.initData;
      if (!initData) {
        setSessionToken(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const session = await createTelegramMiniAppSession({ initData });
        setSessionToken(session.token);
        setUser(session.user);
        setSupportUrl(session.supportUrl || null);
        setLinkedAccount(session.linkedAccount || null);
        sessionStorage.setItem('tg_session_token', session.token);
      } catch (err) {
        console.error('Failed to create session', err);
        // Fail closed
        setSessionToken(null);
        setUser(null);
        setSupportUrl(null);
        setLinkedAccount(null);
        sessionStorage.removeItem('tg_session_token');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  return (
    <AuthContext.Provider value={{ sessionToken, user, supportUrl, linkedAccount, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthHeaders(): Record<string, string> {
  const { sessionToken } = useAuth();
  if (!sessionToken) return {};
  return { Authorization: `Bearer ${sessionToken}` };
}