export type WhitebitMappingStatus = 'supported' | 'mapping_required' | 'unsupported' | string | undefined;

export type WhitebitPersistedRouteState = {
  depositProvider: string;
  customerDepositsEnabled: boolean;
  whitebitAssetCode?: string | null;
  whitebitNetworkCode?: string | null;
  widgetReady?: boolean;
} | null;

export type WhitebitRouteStateInput = {
  mappingStatus: WhitebitMappingStatus;
  mappedAssetCode: string;
  selectedNetworkCode: string;
  canonicalAssetCode?: string;
  canonicalNetworkCode?: string;
  reviewPending: boolean;
  catalogUnavailable: boolean;
  persistedRoute: WhitebitPersistedRouteState;
  exactPermissionProof: boolean;
  credentialReady: boolean;
  owner: boolean;
  saving: boolean;
};

const normalize = (value: string | null | undefined) => value?.trim().toUpperCase() ?? '';

export function savedWhitebitMappingMatchesSelection(
  route: Pick<NonNullable<WhitebitPersistedRouteState>, 'depositProvider' | 'whitebitAssetCode' | 'whitebitNetworkCode'> | null,
  mappedAssetCode: string,
  selectedNetworkCode: string,
  canonicalAssetCode?: string,
  canonicalNetworkCode?: string,
) {
  return Boolean(
    route?.depositProvider === 'whitebit' &&
    normalize(mappedAssetCode) &&
    normalize(selectedNetworkCode) &&
    normalize(route.whitebitAssetCode || canonicalAssetCode) === normalize(mappedAssetCode) &&
    normalize(route.whitebitNetworkCode || canonicalNetworkCode) === normalize(selectedNetworkCode),
  );
}

export function hasCurrentWhitebitPermissionProof(
  routes: ReadonlyArray<{ networkId: string; assetCode: string; networkCode: string; proofCurrent: boolean }> | undefined,
  routeId: string | undefined,
  canonicalAssetCode: string | undefined,
  canonicalNetworkCode: string | undefined,
) {
  return Boolean(routeId && canonicalAssetCode && canonicalNetworkCode && routes?.some(route =>
    route.networkId === routeId &&
    route.proofCurrent &&
    normalize(route.assetCode) === normalize(canonicalAssetCode) &&
    normalize(route.networkCode) === normalize(canonicalNetworkCode),
  ));
}

export function resolveWhitebitNetworkSelection(
  explicitSelection: string,
  mappingStatus: WhitebitMappingStatus,
  automaticNetwork: string,
) {
  return explicitSelection || (mappingStatus === 'supported' ? automaticNetwork : '');
}

/**
 * Pure UI/action eligibility for the saved WhiteBIT route. This intentionally
 * describes route actions only; saving and toggling deposits never verify
 * permission or request a provider address.
 */
export function getWhitebitRouteState(input: WhitebitRouteStateInput) {
  const persistedWhitebitRoute = input.persistedRoute?.depositProvider === 'whitebit'
    ? input.persistedRoute
    : null;
  const mappingValid = input.mappingStatus === 'supported' && Boolean(input.selectedNetworkCode.trim());
  const persistedMappingMatches = savedWhitebitMappingMatchesSelection(
    persistedWhitebitRoute,
    input.mappedAssetCode,
    input.selectedNetworkCode,
    input.canonicalAssetCode,
    input.canonicalNetworkCode,
  );
  const proofMatchesSavedMapping = Boolean(input.exactPermissionProof && persistedMappingMatches);
  const routeEnabled = persistedWhitebitRoute?.customerDepositsEnabled === true;
  const readyForWidget = Boolean(
    routeEnabled &&
    proofMatchesSavedMapping &&
    mappingValid &&
    persistedWhitebitRoute?.widgetReady === true,
  );
  const saveBlockedByEnabledRoute = routeEnabled;
  const canSaveWhitebitRoute = !input.reviewPending &&
    !input.catalogUnavailable &&
    !input.saving &&
    mappingValid &&
    !saveBlockedByEnabledRoute;
  const canVerify = Boolean(
    input.owner &&
    !input.saving &&
    persistedWhitebitRoute &&
    mappingValid &&
    persistedMappingMatches &&
    !input.exactPermissionProof,
  );
  const canEnable = Boolean(
    input.owner &&
    !input.saving &&
    persistedWhitebitRoute &&
    !routeEnabled &&
    mappingValid &&
    persistedMappingMatches &&
    input.exactPermissionProof &&
    input.credentialReady,
  );
  const canDisable = Boolean(input.owner && !input.saving && persistedWhitebitRoute && routeEnabled);

  return {
    mappingValid,
    persistedMappingMatches,
    proofMatchesSavedMapping,
    readyForWidget,
    saveBlockedByEnabledRoute,
    canSaveWhitebitRoute,
    canVerify,
    canEnable,
    canDisable,
    saveAction: canSaveWhitebitRoute ? 'save-route' as const : 'blocked' as const,
    verifyAction: canVerify ? 'verify-permission' as const : 'blocked' as const,
    toggleAction: canEnable
      ? 'enable-deposits' as const
      : canDisable
        ? 'disable-deposits' as const
        : 'blocked' as const,
  };
}