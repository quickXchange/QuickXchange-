import { expect, test } from '@playwright/test';

// All API traffic is intercepted. No provider, database, or Telegram send occurs.
for (const fundedBy of ['whitebit', 'blockchain_monitoring', 'quickex'] as const) {
  test(`${fundedBy}: tracking follows canonical status, never payment evidence alone`, async ({ page }, testInfo) => {
    const convert = fundedBy === 'quickex';
    const orderId = `fixture-${fundedBy}`;
    let status = 'awaiting funds';
    await page.route('**/api/**', route => route.fulfill({ status: 200, json: {} }));
    await page.route('https://telegram.org/js/telegram-web-app.js', route =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.addInitScript(() => {
      const listeners: Record<string, () => void> = {};
      (window as any).Telegram = { WebApp: {
        initData: 'mocked-tracking-init-data', initDataUnsafe: {}, colorScheme: 'dark',
        ready() {}, expand() {}, onEvent(event: string, cb: () => void) { listeners[event] = cb; },
        offEvent(event: string) { delete listeners[event]; },
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
        _listeners: listeners,
      } };
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (value: string) => { (window as any)._copiedValue = value; } },
      });
    });
    await page.route('**/api/telegram/mini-app/session', route => route.fulfill({ status: 200, json: {
      token: 'mock-session', expiresAt: '2099-01-01T00:00:00Z', user: { id: '42' }, linkedAccount: false,
    } }));
    const order = () => ({
      id: orderId, orderKind: convert ? 'convert' : 'swap', type: convert ? 'instant' : 'manual',
      status, fromAsset: 'USDT', fromNetwork: 'TRC20', toAsset: 'ETH', toNetwork: 'ERC20',
      amount: '20', receiveAmount: '0.01', trackingToken: 'mock-tracking-capability',
      createdAt: '2026-01-01T12:00:00Z', depositAsset: 'USDT', depositNetwork: 'TRC20',
      depositAmount: '20', depositAddress: 'mock-order-specific-address', depositMemo: 'fixture-tag',
      fundingSource: fundedBy, verifiedFundingTransaction: {
        transactionHash: 'verified-fixture-only', networkCode: 'TRC20',
        confirmations: 5, requiredConfirmations: 5, amount: '20', assetCode: 'USDT',
      },
    });
    await page.route(`**/api/telegram/mini-app/orders/${orderId}`, route =>
      route.fulfill({ status: 200, json: order() }));
    await page.route(`**/api/orders/${orderId}/status**`, route =>
      route.fulfill({ status: 200, json: order() }));
    await page.route('**/api/telegram/mini-app/orders', route => route.fulfill({ status: 200, json: [order()] }));
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`/telegram-mini-app/orders/${orderId}`);
    await expect(page.getByText('AWAITING FUNDS', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('DONE', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /deposit details/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/send exactly 20 USDT on the TRC20 network/)).toBeVisible();
    expect(await page.getByRole('dialog').locator('svg').count()).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Copy deposit address', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any)._copiedValue)).toBe('mock-order-specific-address');
    await page.getByRole('button', { name: 'Copy memo', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any)._copiedValue)).toBe('fixture-tag');
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    for (const [next, expected] of [
      ['payment detected', 'PAYMENT DETECTED'],
      ['confirming', 'CONFIRMING'],
      ['processing', 'PROCESSING'],
      ['completed', 'DONE'],
    ]) {
      status = next;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.getByText(convert && next === 'payment detected' ? 'CONFIRMING' : expected, { exact: true }).first())
        .toBeVisible({ timeout: 8000 });
    }
    await page.getByRole('button', { name: /recorded deposit details/i }).click();
    await expect(page.getByRole('dialog').getByText(/No additional deposits/)).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Copy/ })).toHaveCount(0);
    await expect(page.getByRole('dialog').getByText('Scan the deposit address')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    for (const dark of [false, true]) {
      await page.evaluate((isDark) => {
        const webApp = (window as any).Telegram.WebApp;
        webApp.colorScheme = isDark ? 'dark' : 'light';
        webApp._listeners.themeChanged?.();
      }, dark);
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*dark).*$/);
      for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`${fundedBy}-${dark ? 'dark' : 'light'}.png`) });
    }
  });
}