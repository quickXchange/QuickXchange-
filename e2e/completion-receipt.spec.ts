import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { publishedSiteContentStub } from '../artifacts/crypto-exchange-widget/test/site-content-stub';

for (const kind of ['manual', 'instant'] as const) {
  test(`completed ${kind === 'manual' ? 'Swap' : 'Convert'} offers only a clean receipt and configured review`, async ({ page }) => {
    const id = kind === 'manual' ? 'O876543210' : 'QX-00000000-0000-4000-8000-000000000001';
    const reviewUrl = `https://www.trustpilot.com/review/${kind}.example`;
    let status = 'processing';
    const order = {
      id,
      type: kind,
      status,
      outcomeUnknown: false,
      refreshUnavailable: false,
      fromAsset: 'BTC',
      fromNetwork: 'Bitcoin',
      toAsset: 'USDT',
      toNetwork: 'TRC20',
      amount: '0.1',
      receiveAmount: '6100',
      exchangeRate: '61000',
      createdAt: '2026-09-20T10:00:00.000Z',
      completedAt: '2026-09-21T11:00:00.000Z',
      verifiedFundingTransaction: {
        transactionHash: `0x${'a'.repeat(64)}`,
        networkCode: 'BTC',
        networkName: 'Bitcoin',
        confirmations: 6,
        detectedAt: '2026-09-20T10:10:00.000Z',
      },
    };

    await page.route('**/api/notification-settings/public', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ trustpilotReviewUrl: kind === 'manual' ? reviewUrl : null }),
    }));
    await page.route('**/api/site-content', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...publishedSiteContentStub,
        socialTrust: {
          ...publishedSiteContentStub.socialTrust,
          items: kind === 'instant'
            ? [{ id: 'trustpilot', group: 'trust', enabled: true, name: 'Trustpilot', href: reviewUrl, displayMode: 'icon-only', objectPath: null }]
            : [],
        },
      }),
    }));
    await page.route(/\/api\/(?:quickex\/)?orders\/[^/]+\/status(?:\?|$)/, route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...order, status }),
    }));

    await page.setViewportSize(kind === 'manual' ? { width: 390, height: 844 } : { width: 1024, height: 800 });
    await page.goto(`/order/${id}?provider=${kind === 'manual' ? 'manual' : 'quickex'}`);
    await expect(page.getByTestId('order-completion-section')).toHaveCount(0);

    status = 'completed';
    await page.reload();
    const completion = page.getByTestId('order-completion-section');
    await expect(completion).toBeVisible();
    await expect(completion.getByRole('button', { name: 'Download PDF' })).toBeVisible();
    await expect(completion.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(completion.getByRole('button', { name: /^Invoice$/i })).toHaveCount(0);
    const review = completion.getByTestId('link-trustpilot-review');
    await expect(review).toHaveAttribute('href', reviewUrl);
    await expect(review).toHaveAttribute('target', '_blank');
    await expect(completion.getByTestId('order-invoice')).toBeHidden();
    await expect(completion.getByTestId('order-invoice')).not.toContainText('Blockchain Transaction');
    await expect(completion.getByTestId('order-invoice')).not.toContainText(order.verifiedFundingTransaction.transactionHash);

    const downloadPromise = page.waitForEvent('download');
    await completion.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`quickxchange-receipt-${id}.pdf`);
    const path = await download.path();
    expect(path).not.toBeNull();
    const pdf = (await readFile(path!)).toString('latin1');
    for (const text of ['COMPLETION RECEIPT', 'EXCHANGE SUMMARY', 'EXCHANGE RATE', '61000', id, 'CREATED DATE', 'COMPLETED DATE']) {
      expect(pdf).toContain(text);
    }
    for (const text of ['BLOCKCHAIN TRANSACTION', 'TRANSACTION ID', 'CONFIRMATIONS', 'DETECTED:', 'EXPLORER', order.verifiedFundingTransaction.transactionHash]) {
      expect(pdf).not.toContain(text);
    }

    await page.emulateMedia({ media: 'print' });
    await expect(completion.getByTestId('order-invoice')).toBeVisible();
    await expect(completion.getByTestId('order-invoice')).not.toContainText('Blockchain Transaction');
    await expect(completion.getByTestId('order-invoice')).not.toContainText(order.verifiedFundingTransaction.transactionHash);
  });
}