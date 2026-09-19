import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createTelegramMiniAppSession } from '@workspace/api-client-react';

interface AuthContextType {
  sessionToken: string | null;
  user: any | null;
  isMock: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  sessionToken: null,
  user: null,
  isMock: false,
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => sessionStorage.getItem('tg_session_token'));
  const [user, setUser] = useState<any | null>(null);
  const [isMock, setIsMock] = useState(false);
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
        setIsMock(true);
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const session = await createTelegramMiniAppSession({ initData });
        setSessionToken(session.token);
        setUser(session.user);
        sessionStorage.setItem('tg_session_token', session.token);
        setIsMock(false);
      } catch (err) {
        console.error('Failed to create session', err);
        // Fail closed
        setSessionToken(null);
        setUser(null);
        sessionStorage.removeItem('tg_session_token');
        setIsMock(false);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  return (
    <AuthContext.Provider value={{ sessionToken, user, isMock, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthHeaders(): Record<string, string> {
  const { sessionToken, isMock } = useAuth();
  if (isMock || !sessionToken) return {};
  return { Authorization: `Bearer ${sessionToken}` };
}
