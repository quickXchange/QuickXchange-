/**
 * Deposit address adapters are deliberately registered outside order
 * selection. Adding an adapter therefore cannot change route matching or
 * fallback semantics.
 */
import { whitebitSwapStatus } from "./whitebit-capabilities";

export type DepositProviderId = string;
export type DepositProviderOption = {
  id: DepositProviderId;
  label: string;
  implemented: boolean;
};

type RegisteredDepositProvider = DepositProviderOption & {
  connected: () => Promise<boolean>;
};

const registeredProviders: RegisteredDepositProvider[] = [
  {
    id: "whitebit",
    label: "WhiteBIT",
    implemented: true,
    connected: async () => {
      const status = await whitebitSwapStatus();
      return status.credentialsReady && !status.explicitDisabled;
    },
  },
];

export function listDepositProviderOptions(): DepositProviderOption[] {
  return [
    ...registeredProviders.map(({ connected: _connected, ...provider }) => provider),
    { id: "manual", label: "Manual Only", implemented: true },
    { id: "none", label: "None", implemented: true },
  ];
}

export async function listConnectedDepositProviderOptions(): Promise<DepositProviderOption[]> {
  const connected = await Promise.all(
    registeredProviders.map(async ({ connected: isConnected, ...provider }) => {
      try {
        return (await isConnected()) ? provider : null;
      } catch {
        return null;
      }
    }),
  );
  return [
    ...connected.filter((provider): provider is DepositProviderOption => provider !== null),
    { id: "manual", label: "Manual Only", implemented: true },
    { id: "none", label: "None", implemented: true },
  ];
}

export function isRegisteredDepositProvider(id: string): id is DepositProviderId {
  return listDepositProviderOptions().some((provider) => provider.id === id);
}