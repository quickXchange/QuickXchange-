import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { publishedSiteContentStub } from '../artifacts/crypto-exchange-widget/test/site-content-stub';

const run = promisify(execFile);

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
      fromAsset: kind === 'manual' ? 'USDT' : 'BTC',
      fromNetwork: kind === 'manual' ? 'BEP20' : 'Bitcoin',
      toAsset: kind === 'manual' ? 'EUR' : 'USDT',
      toNetwork: kind === 'manual' ? 'SEPA transfer' : 'TRC20',
      amount: kind === 'manual' ? '10' : '0.1',
      receiveAmount: kind === 'manual' ? '8.33' : '6100',
      exchangeRate: kind === 'manual' ? '0.833' : '61000',
      receiptFee: kind === 'manual' ? { amount: '0.17', asset: 'EUR' } : undefined,
      step2Details: kind === 'manual' ? [
        { key: 'iban', label: 'IBAN', value: 'DE89370400440532013000' },
        { key: 'accountHolder', label: 'Account Holder', value: 'Alex Example' },
        { key: 'receivingMemo', label: 'Receiving Memo / Tag', value: 'Customer 12' },
      ] : undefined,
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

    const downloadPromise = page.waitForEvent('download');
    await completion.getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`quickxchange-invoice-${id}.pdf`);
    if (kind === 'manual' && process.env.INVOICE_PREVIEW) {
      await download.saveAs(process.env.INVOICE_PREVIEW);
    }
    const path = await download.path();
    expect(path).not.toBeNull();
    const [{ stdout: pdf }, { stdout: info }] = await Promise.all([
      run('pdftotext', ['-layout', path!, '-']),
      run('pdfinfo', [path!]),
    ]);
    expect(info).toMatch(/Page size:\s+595[.\d]* x 841[.\d]* pts \(A4\)/);
    expect(info).toMatch(/Pages:\s+1\b/);
    for (const text of ['INVOICE', 'PAYMENT DETAILS', 'Paid', 'Yes', id, 'EXCHANGE / INVOICE ITEMS', 'Exchange Rate', 'FINAL RECEIVE / TOTAL', 'Thank you for choosing QuickXchange.', 'quickxchange.net', '@Quick_change_support']) {
      expect(pdf.toLowerCase()).toContain(text.toLowerCase());
    }
    expect(pdf).toContain(kind === 'manual' ? 'Exchange USDT to EUR' : 'Exchange BTC to USDT');
    if (kind === 'manual') {
      for (const text of ['PAYMENT / RECEIVING INFORMATION', 'IBAN', 'DE89370400440532013000', 'Account Holder', 'Alex Example', 'Receiving Memo / Tag', '0.17 EUR', '8.33 EUR', 'BEP20', 'SEPA transfer']) {
        expect(pdf.toLowerCase()).toContain(text.toLowerCase());
      }
    } else {
      expect(pdf).not.toContain('PAYMENT / RECEIVING INFORMATION');
      expect(pdf).not.toContain('Fee');
    }
    for (const text of ['BLOCKCHAIN TRANSACTION', 'TRANSACTION ID', 'CONFIRMATIONS', 'DETECTED:', 'EXPLORER', 'Selected Provider', 'Deposit Provider', 'Address Source', 'WhiteBIT', 'Logo URL', order.verifiedFundingTransaction.transactionHash]) {
      expect(pdf).not.toContain(text);
    }

    const previewPromise = page.waitForEvent('popup');
    await completion.getByRole('button', { name: 'Print' }).click();
    const preview = await previewPromise;
    await expect(preview.locator('iframe[title^="QuickXchange invoice"]')).toHaveAttribute('src', /^blob:/);
  });
}

test('long saved Step 2 details paginate without losing the end of the invoice', async ({ page }) => {
  const id = 'O987654321';
  const longValue = `BEGIN DETAILS ${'Bénéficiaire Émilie García — transfer instructions. '.repeat(110)} LAST-LINE-7129`;
  await page.route(/\/api\/orders\/[^/]+\/status(?:\?|$)/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      id, type: 'manual', status: 'completed', outcomeUnknown: false, refreshUnavailable: false,
      fromAsset: 'USDT', fromNetwork: 'BEP20', toAsset: 'EUR', toNetwork: 'SEPA transfer',
      amount: '10', receiveAmount: '8.33', exchangeRate: '0.833',
      createdAt: '2026-09-20T10:00:00.000Z', completedAt: '2026-09-21T11:00:00.000Z',
      step2Details: [{ key: 'instructions', label: 'Transfer instructions', value: longValue }],
    }),
  }));
  await page.goto(`/order/${id}?provider=manual`);
  const completion = page.getByTestId('order-completion-section');
  await expect(completion).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await completion.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const [{ stdout: pdf }, { stdout: info }] = await Promise.all([
    run('pdftotext', ['-layout', path!, '-']),
    run('pdfinfo', [path!]),
  ]);
  expect(info).toMatch(/Pages:\s+[2-9]\b/);
  expect(pdf).toContain('BEGIN DETAILS');
  expect(pdf).toContain('LAST-LINE-7129');
  expect(pdf).toContain('quickxchange.net');
  const previewPromise = page.waitForEvent('popup');
  await completion.getByRole('button', { name: 'Print' }).click();
  const preview = await previewPromise;
  await expect(preview.locator('iframe[title^="QuickXchange invoice"]')).toHaveAttribute('src', /^blob:/);
});