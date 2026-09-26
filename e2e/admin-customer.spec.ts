import { expect, test } from '@playwright/test';

const mockCustomer = {
  id: 'CUST-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'Customer',
  country: 'UK',
  role: 'customer',
  accountStatus: 'active',
  emailVerified: true,
  affiliateCode: 'TEST1234',
  referralRate: '0.2',
  createdAt: '2024-01-01T12:00:00Z',
  lastActivity: '2024-01-01T12:00:00Z',
  totalOrders: 5,
  doneOrders: 4,
  balanceOwedUsd: '150.50',
  totalSalesUsd: '2000.00',
  referredUsers: 2,
  totalReferralProfitUsd: '45.00',
  sendVolume: [{ asset: 'BTC', amount: '0.5' }],
  receiveVolume: [{ asset: 'ETH', amount: '5' }],
  refreshedAt: '2024-01-01T12:00:00Z'
};

const mockList = {
  items: [
    {
      id: 'CUST-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'Customer',
      ordersCount: 5,
      volume: 2000.00,
      lastActivity: '2024-02-01T12:00:00Z',
      status: 'active'
    }
  ],
  total: 1,
  page: 1,
  pageSize: 10
};

const mockReferralsEmpty = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50
};

test.describe('Admin Customer Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/healthz', async route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) }));
    await page.route('**/api/exchange/config', async route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ assets: [], fiatCurrencies: [], settlementOptions: [], manualRouteAvailability: { available: true, routes: [], unavailableMessage: null }, providers: [], feePercent: 0 }) }));
    await page.route(/\/api\/admin\/customers/, async (route) => {
      const url = route.request().url();
      if (url.includes('/referrals')) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockReferralsEmpty) });
      } else if (url.includes('/CUST-123')) {
        if (route.request().method() === 'PATCH') {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...mockCustomer, firstName: 'Edited' }) });
        } else {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockCustomer) });
        }
      } else {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockList) });
      }
    });
  });

  test('navigates to profile, shows real values in three tabs', async ({ page }) => {
    await page.goto('/admin/customers');
    
    await page.click('data-testid=row-customer-CUST-123');
    await expect(page).toHaveURL('/admin/customers/CUST-123');
    
    // User Details Tab
    await expect(page.locator('data-testid=tab-user-details')).toBeVisible();
    await expect(page.locator('data-testid=content-user-details')).toContainText('TEST1234');
    
    // Stats Tab
    await page.click('data-testid=tab-stats');
    await expect(page.locator('data-testid=stat-total-orders')).toContainText('5');
    await expect(page.locator('data-testid=stat-total-sales')).toContainText('$2,000.00');
    await expect(page.locator('data-testid=stat-send-vol-BTC')).toContainText('0.5');
    
    // Referrals Tab
    await page.click('data-testid=tab-referred-users');
    await expect(page.locator('data-testid=empty-referred-users')).toBeVisible();
  });

  test('edit profile success', async ({ page }) => {
    await page.goto('/admin/customers/CUST-123');
    
    await page.click('data-testid=action-edit-profile');
    await page.fill('data-testid=input-edit-firstname', 'Edited');
    await page.click('data-testid=button-save-edit');
    
    await expect(page.locator('.lucide-check').first()).toBeVisible();
  });

  test('cancel-safe password dialog', async ({ page }) => {
    await page.goto('/admin/customers/CUST-123');
    
    await page.click('data-testid=action-reset-password');
    await page.fill('data-testid=input-reset-password', 'newpass123');
    await page.fill('data-testid=input-reset-confirm', 'newpass123');
    await page.click('data-testid=button-cancel-reset');
    
    await expect(page.locator('data-testid=input-reset-password')).toBeHidden();
  });

  test('cancel-safe suspend dialog', async ({ page }) => {
    await page.goto('/admin/customers/CUST-123');
    
    await page.click('data-testid=action-suspend-user');
    await page.click('data-testid=button-cancel-suspend');
    
    await expect(page.locator('data-testid=button-confirm-suspend')).toBeHidden();
  });

  test('User Details Danger Zone stays usable on desktop and mobile', async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/admin/customers/CUST-123');
      const zone = page.locator('.customer-danger-zone');
      const suspend = page.getByTestId('action-suspend-user');
      const revoke = page.getByTestId('action-revoke-all-sessions');
      await expect(zone).toBeVisible();
      await expect(suspend).toBeVisible();
      await expect(revoke).toBeVisible();

      const bounds = await page.evaluate(() => {
        const zone = document.querySelector('.customer-danger-zone')!.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.customer-danger-actions button')].map(button => button.getBoundingClientRect());
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          zone: { left: zone.left, right: zone.right },
          buttons: buttons.map(({ left, right, top, bottom }) => ({ left, right, top, bottom })),
        };
      });
      expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
      expect(bounds.zone.left).toBeGreaterThanOrEqual(0);
      expect(bounds.zone.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
      for (const button of bounds.buttons) {
        expect(button.left).toBeGreaterThanOrEqual(bounds.zone.left);
        expect(button.right).toBeLessThanOrEqual(bounds.zone.right + 1);
      }
      const [first, second] = bounds.buttons;
      expect(second.left >= first.right + 7 || second.top >= first.bottom + 7).toBe(true);
      await suspend.click();
      await expect(page.getByTestId('button-cancel-suspend')).toBeVisible();
      await page.getByTestId('button-cancel-suspend').click();
    }
  });

  test('Total Orders opens the ID-scoped order directory', async ({ page }) => {
    await page.route(/\/api\/orders(?:\?.*)?$/, async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [], total: 0, page: 1, pageSize: 20,
          refreshUnavailable: false, providerFreshness: { state: 'unavailable', syncing: false },
        }),
      });
    });
    await page.goto('/admin/customers/CUST-123');
    await page.getByTestId('tab-stats').click();
    const request = page.waitForRequest(request => {
      if (!request.url().includes('/api/orders?')) return false;
      const params = new URL(request.url()).searchParams;
      return params.get('customerId') === 'CUST-123' && params.get('archived') === 'all';
    });
    await page.getByTestId('stat-total-orders').click();
    await request;
    await expect(page).toHaveURL(/\/admin\/orders\?customerId=CUST-123$/);
    await expect(page.getByTestId('orders-user-id')).toHaveText('CUST-123');
    await expect(page.getByTestId('tab-orders-all')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('button-export')).toHaveCount(0);
  });
});
