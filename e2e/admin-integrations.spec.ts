import { expect, test } from '@playwright/test';

test('owners can validate and integrate Quickex without exposing saved credentials', async ({ page }) => {
  let connected = false;
  let submittedCredentials: Record<string, unknown> | undefined;
  let diagnosticsRuns = 0;

  await page.route('**/api/quickex/admin/credentials', async (route) => {
    if (route.request().method() === 'PUT') {
      submittedCredentials = route.request().postDataJSON() as Record<string, unknown>;
      connected = true;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'Quickex',
        liveQuotes: true,
        signedOrders: connected,
        configured: connected,
        remotelyAuthenticated: connected,
        verificationState: connected ? 'verified' : 'not_configured',
        providerReachability: 'unknown',
        blockedByProviderPolicy: false,
        apiKeyConfigured: false,
        publicKeyConfigured: connected,
        secretKeyConfigured: connected,
        credentialSource: connected ? 'stored' : 'none',
        canManage: true,
        updatedAt: connected ? '2026-08-25T09:00:00.000Z' : undefined,
        mode: connected ? 'Signed orders enabled' : 'Public live quotes only',
        message: connected
          ? 'Live quotes and signed order creation are enabled.'
          : 'Add signing credentials to enable instant order creation.',
        reconciliation: {
          state: 'healthy',
          consecutiveFailures: 0,
          freshnessMs: 0,
          lastStartedAt: null,
          lastSucceededAt: null,
          lastFailedAt: null,
          nextRetryAt: null,
        },
      }),
    });
  });
  await page.route('**/api/admin/providers/whitebit**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      provider: 'whitebit',
      enabled: false,
      explicitDisabled: true,
      credentialsReady: false,
      state: 'disabled',
      lastCapabilitySyncAt: null,
      matchedRouteCount: 0,
      webhookReady: false,
    }),
  }));
  // The broad status fixture above is an object; this endpoint returns an array.
  await page.route('**/api/admin/providers/whitebit/verification-routes**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.route('**/api/quickex/admin/credentials/test', async (route) => {
    diagnosticsRuns += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true, provider: 'Quickex', publicApiReachable: true,
        signedApiReachable: true, remotelyAuthenticated: true,
        authenticationState: 'verified', blockedByProviderPolicy: false,
        checkedAt: '2026-08-25T09:00:00.000Z',
        message: 'The signed Quickex V2 Order API is authenticated and reachable.',
      }),
    });
  });

  await page.goto('/admin/integrations');
  await expect(page.getByRole('heading', { name: 'API Integrations' })).toBeVisible();

  await page.getByRole('button', { name: 'Test signed Order API' }).click();
  await expect.poll(() => diagnosticsRuns).toBe(1);
  await expect(page.getByText(/authenticated and reachable/)).toBeVisible();

  await page.getByRole('button', { name: 'Add Integration' }).click();
  await expect(page.getByRole('heading', { name: 'Integrate Quickex' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 640 });

  const publicKey = page.getByLabel('Public API Key');
  const secretKey = page.getByLabel('Secret API Key');
  const pin = page.getByLabel('PIN code');
  await expect(pin).toHaveAttribute('type', 'password');
  await expect(publicKey).toHaveAttribute('type', 'password');
  await expect(secretKey).toHaveAttribute('type', 'password');
  await expect(publicKey).toBeDisabled();
  await expect(secretKey).toBeDisabled();
  await expect(publicKey).toHaveValue('');
  await expect(secretKey).toHaveValue('');

  await pin.fill('2468');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(publicKey).toBeEnabled();
  await expect(secretKey).toBeEnabled();
  await publicKey.fill('browser-public-key');
  await secretKey.fill('browser-secret-key');
  const integrateButton = page.getByRole('button', { name: 'Integrate Quickex' });
  await integrateButton.scrollIntoViewIfNeeded();
  await expect(integrateButton).toBeVisible();
  await integrateButton.click();

  await expect.poll(() => submittedCredentials).toEqual({
    publicKey: 'browser-public-key',
    secretKey: 'browser-secret-key',
  });
  await expect(page.getByText(/Quickex signed Order API connected/)).toBeVisible();
  await expect(publicKey).toHaveValue('');
  await expect(secretKey).toHaveValue('');
  await expect(pin).toHaveValue('');
  await expect(publicKey).toBeDisabled();
  await expect(secretKey).toBeDisabled();
  await expect(page.getByText('Encrypted storage')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Quickex' })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Encrypted storage')).toBeVisible();
  await page.getByRole('button', { name: 'Configure Quickex' }).click();
  await expect(page.getByLabel('Public API Key')).toHaveValue('');
  await expect(page.getByLabel('Secret API Key')).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('browser-public-key');
  await expect(page.locator('body')).not.toContainText('browser-secret-key');
});

test('provider summary stays unknown when integration status cannot be loaded', async ({ page }) => {
  await page.route('**/api/admin/providers/whitebit/verification-routes**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/quickex/admin/credentials', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Provider status is temporarily unavailable.' }),
    });
  });

  await page.goto('/admin/integrations');
  await expect(page.getByRole('heading', { name: 'API Integrations' })).toBeVisible();
  await expect(page.getByTestId('integration-summary-connected')).toHaveText('—');
  await expect(page.getByTestId('integration-summary-healthy')).toHaveText('—');
  await expect(page.getByTestId('integration-summary-warning')).toHaveText('—');
  await expect(page.getByTestId('integration-summary-failed')).toHaveText('—');
});

test('provider health treats a missing legacy API key as not required when signing keys are active', async ({ page }) => {
  await page.route('**/api/admin/operators**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 'operator-e2e', email: 'operator@example.test', role: 'owner', status: 'active' },
    ]),
  }));
  await page.route('**/api/admin/authorization', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      member: { id: 'operator-e2e', email: 'operator@example.test', role: 'owner', status: 'active' },
      owner: true,
      effectivePermissions: [],
      catalog: [],
    }),
  }));
  await page.route(/\/api\/admin\/summary(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        product: 'swap',
        from: '2025-06-01T00:00:00.000Z',
        to: '2025-06-30T23:59:59.999Z',
        totalOrders: 0,
        pendingOrders: 0,
        completedOrders: 0,
        failedCancelledOrders: 0,
        totalCustomers: 0,
        totalUsers: 0,
        completionRate: 0,
        averageCompletionTimeMinutes: null,
        averageOrderValueUsd: 0,
        topPaymentMethods: [],
        topCurrencies: [],
        topTradingPairs: [],
        dailySeries: [],
        recentActivity: [],
        valuation: {
          observedAt: null,
          status: 'unavailable',
          valuedOrders: 0,
          totalOrders: 0,
          unavailableCurrencies: [],
        },
        operationalHealth: {
          providerFreshness: {
            state: 'healthy',
            syncing: false,
            lastSucceededAt: '2025-06-30T12:00:00.000Z',
          },
          quickexReconciliation: {
            state: 'healthy',
            consecutiveFailures: 0,
            freshnessMs: 1000,
            lastStartedAt: '2025-06-30T12:00:00.000Z',
            lastSucceededAt: '2025-06-30T12:00:00.000Z',
            lastFailedAt: null,
            nextRetryAt: null,
          },
          catalog: { stale: false, ageMs: null, lastFailureAt: null },
          unresolvedOrders: 0,
          notificationsPending: 0,
          notificationsFailed: 0,
          oldestPendingNotificationAt: null,
        },
      }),
    });
  });
  await page.route('**/api/quickex/admin/credentials', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'Quickex',
        liveQuotes: true,
        signedOrders: true,
        configured: true,
        remotelyAuthenticated: true,
        verificationState: 'verified',
        providerReachability: 'unknown',
        blockedByProviderPolicy: false,
        apiKeyConfigured: false,
        publicKeyConfigured: true,
        secretKeyConfigured: true,
        credentialSource: 'stored',
        canManage: true,
        updatedAt: '2026-08-25T09:00:00.000Z',
        mode: 'Signed orders enabled',
        message: 'Live quotes and signed order creation are enabled.',
        reconciliation: {
          state: 'cooling_down',
          consecutiveFailures: 2,
          freshnessMs: 180_000,
          lastStartedAt: '2026-08-25T09:03:00.000Z',
          lastSucceededAt: '2026-08-25T09:00:00.000Z',
          lastFailedAt: '2026-08-25T09:03:00.000Z',
          nextRetryAt: '2026-08-25T09:08:00.000Z',
        },
      }),
    });
  });

  await page.goto('/admin/providers');
  await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
  await expect(page.getByText('Legacy API Key')).toBeVisible();
  await expect(page.getByText('Not required', { exact: true })).toBeVisible();
  await expect(page.locator('.providers-panel').first().getByText('Missing', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('warning-provider-reconciliation')).toContainText('2 consecutive failures');
  await expect(page.getByTestId('warning-provider-reconciliation')).toContainText('affiliate completion or reversal credits may be delayed');
});