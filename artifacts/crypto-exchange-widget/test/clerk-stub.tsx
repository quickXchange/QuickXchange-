import type { PropsWithChildren, ReactNode } from 'react';

type ClerkSnapshot = {
  user?: {
    id?: string;
  } | null;
};

function isE2eGuest() {
  return new URLSearchParams(window.location.search).has('__e2eGuest');
}

export function ClerkProvider({ children }: PropsWithChildren<Record<string, unknown>>) {
  return children;
}

export function Show({ children, when }: { children?: ReactNode; when: string }) {
  const signedIn = !isE2eGuest();
  return when === (signedIn ? 'signed-in' : 'signed-out') ? children : null;
}

export function SignIn() {
  return null;
}

export function SignUp() {
  return null;
}

export function UserProfile() {
  return null;
}

export function useClerk() {
  return {
    addListener: (_listener: (snapshot: ClerkSnapshot) => void) => () => undefined,
    signOut: async () => undefined,
  };
}

export function useUser() {
  const signedIn = !isE2eGuest();
  return {
    isLoaded: true,
    isSignedIn: signedIn,
    user: signedIn ? {
      id: 'e2e-operator',
      firstName: 'Test',
      fullName: 'Test Operator',
      primaryEmailAddress: {
        emailAddress: 'operator@example.test',
      },
    } : null,
  };
}

export function publishableKeyFromHost() {
  return 'pk_test_e2e';
}

export const shadcn = {};