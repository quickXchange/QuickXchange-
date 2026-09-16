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
});
