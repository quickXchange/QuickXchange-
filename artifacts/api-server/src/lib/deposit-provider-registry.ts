/**
 * Deposit address adapters are deliberately registered outside order
 * selection. Adding an adapter therefore cannot change route matching or
 * fallback semantics.
 */
export type DepositProviderId = "whitebit" | "manual" | "none";
export type DepositProviderOption = {
  id: DepositProviderId;
  label: string;
  implemented: boolean;
};

const registeredProviders: DepositProviderOption[] = [
  { id: "whitebit", label: "WhiteBIT", implemented: true },
];

export function listDepositProviderOptions(): DepositProviderOption[] {
  return [
    ...registeredProviders,
    { id: "manual", label: "Manual Only", implemented: true },
    { id: "none", label: "None", implemented: true },
  ];
}

export function isRegisteredDepositProvider(id: string): id is DepositProviderId {
  return listDepositProviderOptions().some((provider) => provider.id === id);
}