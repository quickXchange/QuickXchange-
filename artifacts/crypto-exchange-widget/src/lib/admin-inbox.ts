import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { useGetAdminInbox } from '@workspace/api-client-react';
import type { GetAdminInboxParams } from '@workspace/api-client-react';

const INBOX_PREFIX = '/api/admin/notifications';

export function useInboxQueryClientActions() {
  const queryClient = useQueryClient();
  return {
    invalidateAll: () => queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === INBOX_PREFIX,
    }),
  };
}

/** Drops cached inbox data whenever the signed-in operator changes. */
export function useInboxIdentityScope() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const id = user?.id ?? null;
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== id) {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === INBOX_PREFIX });
    }
    previous.current = id;
  }, [id, queryClient]);
  return id;
}

export function useAdminInboxLive(params: GetAdminInboxParams) {
  const operatorId = useInboxIdentityScope();
  return useGetAdminInbox(params, {
    query: {
      queryKey: [INBOX_PREFIX, { ...params, operator: operatorId }] as const,
      enabled: Boolean(operatorId),
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
      refetchOnMount: 'always',
      staleTime: 0,
    },
  });
}
