import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  getWhitebitRouteState,
  hasCurrentWhitebitPermissionProof,
  resolveWhitebitNetworkSelection,
} = await import(process.env.WHITEBIT_ROUTE_STATE_MODULE);

function state(overrides = {}) {
  return getWhitebitRouteState({
    mappingStatus: 'supported',
    mappedAssetCode: 'USDT',
    selectedNetworkCode: 'ERC20',
    reviewPending: false,
    catalogUnavailable: false,
    persistedRoute: null,
    exactPermissionProof: false,
    credentialReady: true,
    owner: true,
    saving: false,
    ...overrides,
  });
}

test('BNB/BNB persisted WhiteBIT ON with canonical BEP20 proof is ready; ordinary Save is blocked', () => {
  const exactPermissionProof = hasCurrentWhitebitPermissionProof(
    [{ networkId: 'bnb-route', assetCode: 'BNB', networkCode: 'BNB', proofCurrent: true }],
    'bnb-route',
    'BNB',
    'BNB',
  );
  const result = state({
    mappedAssetCode: 'BNB',
    selectedNetworkCode: 'BEP20',
    persistedRoute: {
      depositProvider: 'whitebit',
      customerDepositsEnabled: true,
      whitebitAssetCode: 'BNB',
      whitebitNetworkCode: 'BEP20',
      widgetReady: true,
    },
    exactPermissionProof,
  });

  assert.equal(exactPermissionProof, true);
  assert.equal(hasCurrentWhitebitPermissionProof(
    [{ networkId: 'bnb-route', assetCode: 'BNB', networkCode: 'BEP20', proofCurrent: true }],
    'bnb-route', 'BNB', 'BNB',
  ), false);
  assert.equal(result.mappingValid, true);
  assert.equal(result.readyForWidget, true);
  assert.equal(result.saveBlockedByEnabledRoute, true);
  assert.equal(result.canSaveWhitebitRoute, false);
  assert.equal(result.saveAction, 'blocked');
  assert.equal(result.canDisable, true);
  assert.equal(result.toggleAction, 'disable-deposits');
  assert.equal(result.canVerify, false);
  assert.equal(result.verifyAction, 'blocked');
});

test('USDT/ERC20 is supported but requires Verify before it is ready or enabled', () => {
  const result = state({
    persistedRoute: {
      depositProvider: 'whitebit',
      customerDepositsEnabled: false,
      whitebitAssetCode: 'USDT',
      whitebitNetworkCode: 'ERC20',
      widgetReady: false,
    },
  });

  assert.equal(result.mappingValid, true);
  assert.equal(result.canVerify, true);
  assert.equal(result.verifyAction, 'verify-permission');
  assert.equal(result.canEnable, false);
  assert.equal(result.readyForWidget, false);
});

test('USDT/BEP20 is supported but requires Verify before it is ready or enabled', () => {
  const result = state({
    selectedNetworkCode: 'BEP20',
    persistedRoute: {
      depositProvider: 'whitebit',
      customerDepositsEnabled: false,
      whitebitAssetCode: 'USDT',
      whitebitNetworkCode: 'BEP20',
      widgetReady: false,
    },
  });

  assert.equal(result.mappingValid, true);
  assert.equal(result.canVerify, true);
  assert.equal(result.verifyAction, 'verify-permission');
  assert.equal(result.canEnable, false);
  assert.equal(result.readyForWidget, false);
});

test('Manual OFF route remains Manual until a WhiteBIT provider draft is saved', () => {
  const draftNetwork = resolveWhitebitNetworkSelection('', 'supported', 'TRC20');
  const result = state({
    selectedNetworkCode: draftNetwork,
    persistedRoute: {
      depositProvider: 'manual',
      customerDepositsEnabled: false,
      whitebitAssetCode: 'USDT',
      whitebitNetworkCode: 'TRC20',
      widgetReady: false,
    },
  });

  assert.equal(draftNetwork, 'TRC20');
  assert.equal(result.mappingValid, true);
  assert.equal(result.saveAction, 'save-route');
  assert.equal(result.canVerify, false);
  assert.equal(result.verifyAction, 'blocked');
  assert.equal(result.canEnable, false);
  assert.equal(result.readyForWidget, false);
  assert.notEqual(result.saveAction, 'verify');
  assert.notEqual(result.toggleAction, 'request-verification-address');
});

test('unsupported identities cannot be saved, verified, or enabled', async (t) => {
  for (const route of [
    { asset: 'AVAXC', network: 'XCHAIN' },
    { asset: 'USDT', network: 'POLYGON' },
  ]) {
    await t.test(`${route.asset}/${route.network}`, () => {
      const result = state({
        mappingStatus: 'unsupported',
        mappedAssetCode: route.asset,
        selectedNetworkCode: '',
        persistedRoute: {
          depositProvider: 'whitebit',
          customerDepositsEnabled: false,
          whitebitAssetCode: route.asset,
          whitebitNetworkCode: route.network,
          widgetReady: false,
        },
      });

      assert.equal(result.mappingValid, false);
      assert.equal(result.canSaveWhitebitRoute, false);
      assert.equal(result.canVerify, false);
      assert.equal(result.verifyAction, 'blocked');
      assert.equal(result.canEnable, false);
      assert.equal(result.readyForWidget, false);
    });
  }
});

test('ambiguous advertised mapping waits for the Owner exact choice without auto-selection', () => {
  const automaticCandidate = resolveWhitebitNetworkSelection('', 'mapping_required', 'ERC20');
  const result = state({
    mappingStatus: 'mapping_required',
    selectedNetworkCode: automaticCandidate,
  });

  assert.equal(automaticCandidate, '');
  assert.equal(result.mappingValid, false);
  assert.equal(result.canSaveWhitebitRoute, false);
  assert.equal(result.canVerify, false);
  assert.equal(result.verifyAction, 'blocked');
  assert.equal(result.canEnable, false);
  assert.equal(result.readyForWidget, false);
});

test('stale proof does not prevent turning an already-enabled WhiteBIT route OFF', () => {
  const result = state({
    persistedRoute: {
      depositProvider: 'whitebit',
      customerDepositsEnabled: true,
      whitebitAssetCode: 'USDT',
      whitebitNetworkCode: 'ERC20',
      widgetReady: true,
    },
    exactPermissionProof: false,
  });

  assert.equal(result.readyForWidget, false);
  assert.equal(result.canEnable, false);
  assert.equal(result.canDisable, true);
  assert.equal(result.toggleAction, 'disable-deposits');
});

test('save and deposit toggles produce only route actions, never a verification-address request', () => {
  const save = state();
  const turnOff = state({
    mappedAssetCode: 'BNB',
    selectedNetworkCode: 'BEP20',
    persistedRoute: {
      depositProvider: 'whitebit',
      customerDepositsEnabled: true,
      whitebitAssetCode: 'BNB',
      whitebitNetworkCode: 'BEP20',
      widgetReady: true,
    },
    exactPermissionProof: false,
  });
  assert.equal(save.saveAction, 'save-route');
  assert.equal(turnOff.toggleAction, 'disable-deposits');
  assert.doesNotMatch(`${save.saveAction} ${turnOff.toggleAction}`, /verify|address/i);
});