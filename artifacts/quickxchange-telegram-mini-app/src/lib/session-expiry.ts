import { MutationCache, QueryCache, QueryClient, type QueryClientConfig } from '@tanstack/react-query';

export type SessionExpiryHandler = () => void;

const sessionExpiryHandlers = new Map<symbol, SessionExpiryHandler>();

export function registerSessionExpiryHandler(handler: SessionExpiryHandler): () => void {
  const owner = Symbol('session-expiry-owner');
  sessionExpiryHandlers.set(owner, handler);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    sessionExpiryHandlers.delete(owner);
  };
}

export function notifySessionExpired(): void {
  for (const handler of [...sessionExpiryHandlers.values()]) handler();
}

export function handleSessionError(error: unknown, onExpired: () => void = notifySessionExpired): void {
  if (isUnauthorizedError(error)) onExpired();
}

export function createSessionAwareQueryClient(
  config: Pick<QueryClientConfig, 'defaultOptions'> = {},
): QueryClient {
  let queryClient: QueryClient;
  const expireAndClear = (error: unknown) => {
    if (!isUnauthorizedError(error)) return;
    void queryClient.cancelQueries();
    queryClient.clear();
    notifySessionExpired();
  };
  queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: expireAndClear }),
    mutationCache: new MutationCache({ onError: expireAndClear }),
    defaultOptions: config.defaultOptions,
  });
  return queryClient;
}

export function clearTelegramSession(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem('tg_session_token');
}

export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  return candidate.status === 401 || candidate.response?.status === 401;
}

export function createIdempotentSessionExpiry(onExpire: () => void): {
  expire: () => void;
  reset: () => void;
} {
  let expired = false;
  return {
    expire: () => {
      if (expired) return;
      expired = true;
      onExpire();
    },
    reset: () => {
      expired = false;
    },
  };
}