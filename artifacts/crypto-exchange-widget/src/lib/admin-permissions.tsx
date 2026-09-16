import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  useGetCurrentAdminAuthorization,
} from '@workspace/api-client-react';
import type { AdminAuthorization, PermissionKey } from '@workspace/api-client-react';

/**
 * The client deliberately keeps this list small and explicit.  In particular,
 * a forged owner-only key in effectivePermissions must never make a staff
 * control visible.
 */
const OWNER_ONLY_KEYS = new Set([
  'crypto_networks.receiving_wallets',
  'receiving_wallets.manage',
  'integrations.credentials.create',
  'integrations.credentials.update',
  'integrations.credentials.delete',
  'integrations.credentials.rotate',
  'team.members.invite',
  'team.members.update',
  'team.members.suspend',
  'team.members.remove',
  'team.roles.create',
  'team.roles.update',
  'team.roles.delete',
  'team.permissions.individual',
  'team.owner.lifecycle',
]);

export type AdminPermissionKey = PermissionKey;

export type AdminPermissionState = {
  authorization?: AdminAuthorization;
  isLoading: boolean;
  error: unknown;
  isOwner: boolean;
  can: (permission: AdminPermissionKey) => boolean;
  canAny: (...permissions: AdminPermissionKey[]) => boolean;
  canAll: (...permissions: AdminPermissionKey[]) => boolean;
};

const AdminPermissionsContext = createContext<AdminPermissionState | null>(null);

function stateFromAuthorization(
  authorization: AdminAuthorization | undefined,
  isLoading: boolean,
  error: unknown,
): AdminPermissionState {
  const isOwner = Boolean(authorization?.owner);
  const can = (permission: AdminPermissionKey) => {
    if (isOwner) return true;
    if (OWNER_ONLY_KEYS.has(permission)) return false;
    return Boolean(authorization?.effectivePermissions.includes(permission as any));
  };
  return {
    authorization,
    isLoading,
    error,
    isOwner,
    can,
    canAny: (...permissions) => permissions.some(can),
    canAll: (...permissions) => permissions.every(can),
  };
}

export function AdminPermissionsProvider({ children }: { children: ReactNode }) {
  const authorization = useGetCurrentAdminAuthorization();
  const value = useMemo(
    () => stateFromAuthorization(authorization.data, authorization.isLoading, authorization.error),
    [authorization.data, authorization.error, authorization.isLoading],
  );
  return <AdminPermissionsContext.Provider value={value}>{children}</AdminPermissionsContext.Provider>;
}

/**
 * Shared action-level authorization state for every Admin page.  The fallback
 * query makes page components safe when rendered in isolation (for example in
 * a component test); AdminGate supplies the provider in the real app.
 */
export function useAdminPermissions(): AdminPermissionState {
  const context = useContext(AdminPermissionsContext);
  const authorization = useGetCurrentAdminAuthorization();
  const fallback = useMemo(
    () => stateFromAuthorization(authorization.data, authorization.isLoading, authorization.error),
    [authorization.data, authorization.error, authorization.isLoading],
  );
  return context ?? fallback;
}

export function PermissionGate({
  permission,
  children,
}: {
  permission: AdminPermissionKey;
  children: ReactNode;
}) {
  const { can } = useAdminPermissions();
  return can(permission) ? <>{children}</> : null;
}
