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
    await page.route('**/api/account/affiliate/attribution', async route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'no_referral' }) }));
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

  test('Users directory keeps information reachable at desktop, tablet and mobile widths', async ({ page }) => {
    for (const width of [1280, 960, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/admin/customers');
      const row = page.getByTestId('row-customer-CUST-123');
      const card = page.getByTestId('user-card-CUST-123');
      if (width <= 820) {
        await expect(card).toBeVisible();
        await expect(card).toContainText('test@example.com');
        await expect(row).toBeHidden();
      } else {
        await expect(row).toBeVisible();
        await expect(card).toBeHidden();
      }
      const geometry = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      }));
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    }
    await page.getByTestId('user-card-CUST-123').click();
    await expect(page).toHaveURL('/admin/customers/CUST-123');
  });

  test('edit and password dialogs keep their controls reachable on smaller screens', async ({ page }) => {
    let resets = 0;
    await page.route('**/api/admin/customers/CUST-123/password-reset', async route => {
      resets++;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'CUST-123', action: 'password_reset', accountStatus: 'active', refreshedAt: new Date().toISOString() }) });
    });
    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 680 });
      await page.goto('/admin/customers/CUST-123');
      await page.getByTestId('action-edit-profile').click();
      await expect(page.getByTestId('button-save-edit')).toBeInViewport();
      const edit = await page.locator('.customer-edit-dialog').boundingBox();
      expect(edit!.x).toBeGreaterThanOrEqual(0);
      expect(edit!.x + edit!.width).toBeLessThanOrEqual(width + 1);
      await page.getByTestId('button-cancel-edit').click();
      await page.getByTestId('action-reset-password').click();
      await page.getByTestId('input-reset-password').fill('newpassword123');
      await page.getByTestId('input-reset-confirm').fill('newpassword123');
      await page.getByTestId('button-submit-reset').click();
      await expect(page.getByTestId('button-back-reset')).toBeVisible();
      expect(resets).toBe(0);
      await expect(page.getByTestId('button-submit-reset')).toBeInViewport();
      if (width === 320) {
        await page.getByTestId('button-submit-reset').click();
        await expect(page.getByTestId('button-submit-reset')).toBeHidden();
        expect(resets).toBe(1);
      } else {
        await page.getByTestId('button-cancel-reset').click();
      }
    }
  });

  test('email confirmation changes status only after proof is reflected by the API', async ({ page }) => {
    let confirmed = false;
    let submissions = 0;
    await page.route(/\/api\/admin\/customers\/CUST-123(?:\/email-confirm)?(?:\?.*)?$/, async route => {
      if (route.request().method() === 'POST') {
        submissions++;
        confirmed = true;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          id: 'CUST-123', action: 'email_confirm', accountStatus: 'active', refreshedAt: new Date().toISOString(),
        }) });
      } else {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...mockCustomer, emailVerified: confirmed }) });
      }
    });
    await page.goto('/admin/customers/CUST-123');
    await expect(page.locator('.customer-profile-badge--unconfirmed')).toBeVisible();
    await page.getByTestId('action-confirm-email').click();
    await expect(page.locator('.customer-profile-badge--confirmed')).toBeVisible();
    await expect(page.getByTestId('action-confirm-email')).toBeHidden();
    expect(submissions).toBe(1);
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
