import { ArrowRight, CheckCircle2, Download, ExternalLink, FileText, Printer, ShieldCheck, Star } from 'lucide-react';
import type { CustomerOrder, ManualPublicOrderStatus, PublicOrderStatus } from '@workspace/api-client-react';
import { basePath, number } from '@/components/shared-app-ui';
import { OrderSettlementIdentity } from '@/components/order-settlement-identity';

type CompletionOrder = CustomerOrder | (PublicOrderStatus & Partial<ManualPublicOrderStatus>);

function isCompletedConvert(order: CompletionOrder): boolean {
  return order.type === 'instant' &&
    /^(?:completed|done)$/i.test(order.status.trim()) &&
    !order.outcomeUnknown;
}

export function isCompletedManualSwap(order: CompletionOrder, refreshWarning = false): boolean {
  return order.type === 'manual' &&
    /^(?:completed|complete|done|finished)$/i.test(order.status.trim()) &&
    !order.outcomeUnknown &&
    !order.refreshUnavailable &&
    !refreshWarning;
}

function printable(value: unknown): string {
  return String(value ?? '—').replace(/[^\x20-\x7e]/g, '');
}

function optionalOrderString(order: CompletionOrder, key: string): string | undefined {
  const value = (order as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

type InvoiceLogo = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

function encodePdfText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function loadInvoiceLogo(): Promise<InvoiceLogo | null> {
  try {
    const image = new Image();
    image.src = `${basePath}/brand/quickxchange-header-dark.png`;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('QuickXchange invoice logo could not be loaded.'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#0b111f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94));
    if (!blob) return null;
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

async function buildInvoicePdf(order: CompletionOrder): Promise<Blob> {
  const isConvert = order.type === 'instant';
  const completedAt = order.completedAt ||
    optionalOrderString(order, 'providerUpdatedAt') ||
    optionalOrderString(order, 'updatedAt');
  const paymentMethod = order.sourcePaymentMethod?.name || order.paymentDetails?.name || '—';
  const receiveRouteLabel = isConvert ? order.toNetwork || 'Network unavailable' : order.toNetwork || paymentMethod;
  const logo = await loadInvoiceLogo();

  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const text = (value: unknown) => escape(printable(value));
  const date = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';
  const transaction = order.verifiedFundingTransaction;
  const wrap = (value: string, width = 66) => {
    const result: string[] = [];
    for (let offset = 0; offset < value.length; offset += width) result.push(value.slice(offset, offset + width));
    return result.length > 0 ? result : ['—'];
  };

  const stream = [
    '0.043 0.067 0.122 rg',
    '0 650 612 142 re f',
    '0.024 0.714 0.831 rg',
    '0 788 612 4 re f',
    '0.055 0.337 0.827 rg',
    '0 784 204 4 re f',
    '0.486 0.173 1 rg',
    '204 784 204 4 re f',
    ...(logo ? [
      'q',
      '154 0 0 65 42 706 cm',
      '/Logo Do',
      'Q',
    ] : []),
    'BT',
    '1 1 1 rg',
    '/F1 15 Tf',
    '372 744 Td',
    `(${text('COMPLETION RECEIPT')}) Tj`,
    '0.133 0.773 0.369 rg',
    '/F1 10 Tf',
    '0 -24 Td',
    `(${text('✓ COMPLETED')}) Tj`,
    '0.75 0.82 0.91 rg',
    '/F1 8 Tf',
    '0 -22 Td',
    `(${text(`ORDER ${order.id}`)}) Tj`,
    'ET',
    '0.92 0.95 0.98 rg',
    '36 612 540 20 re f',
    'BT',
    '0.08 0.12 0.2 rg',
    '/F1 9 Tf',
    '46 619 Td',
    `(${text('TRANSACTION SUMMARY')}) Tj`,
    'ET',
    '0.965 0.976 0.992 rg',
    '36 516 250 82 re f',
    '36 516 250 82 re S',
    '326 516 250 82 re f',
    '326 516 250 82 re S',
    'BT',
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '52 579 Td',
    `(${text('YOU SEND')}) Tj`,
    '0.04 0.07 0.12 rg',
    '/F1 16 Tf',
    '0 -25 Td',
    `(${text(`${number(order.amount)} ${order.fromAsset}`)}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 9 Tf',
    '0 -18 Td',
    `(${text(order.fromNetwork || 'Network unavailable')}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '290 43 Td',
    `(${text('YOU RECEIVE')}) Tj`,
    '0.055 0.337 0.827 rg',
    '/F1 16 Tf',
    '0 -25 Td',
    `(${text(`${number(order.receiveAmount)} ${order.toAsset}`)}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 9 Tf',
    '0 -18 Td',
    `(${text(receiveRouteLabel)}) Tj`,
    'ET',
    '0.92 0.95 0.98 rg',
    '36 476 540 20 re f',
    'BT',
    '0.08 0.12 0.2 rg',
    '/F1 9 Tf',
    '46 483 Td',
    `(${text('ORDER DETAILS')}) Tj`,
    'ET',
    'BT',
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '46 452 Td',
    `(${text('ORDER ID')}) Tj`,
    '0.04 0.07 0.12 rg',
    '/F1 9 Tf',
    '0 -14 Td',
    `(${text(order.id)}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '0 -28 Td',
    `(${text('EXCHANGE TYPE')}) Tj`,
    '0.04 0.07 0.12 rg',
    '/F1 9 Tf',
    '0 -14 Td',
    `(${text(isConvert ? 'Convert' : 'Swap')}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '0 -28 Td',
    `(${text('NETWORK')}) Tj`,
    '0.04 0.07 0.12 rg',
    '/F1 9 Tf',
    '0 -14 Td',
    `(${text(order.fromNetwork || '—')}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '280 84 Td',
    `(${text('CREATED DATE')}) Tj`,
    '0.04 0.07 0.12 rg',
    '/F1 9 Tf',
    '0 -14 Td',
    `(${text(date(order.createdAt))}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '0 -28 Td',
    `(${text('COMPLETED DATE')}) Tj`,
    '0.04 0.07 0.12 rg',
    '/F1 9 Tf',
    '0 -14 Td',
    `(${text(date(completedAt))}) Tj`,
    '0.39 0.46 0.57 rg',
    '/F1 8 Tf',
    '0 -28 Td',
    `(${text(isConvert ? 'STATUS' : 'EXCHANGE RATE')}) Tj`,
    '0.04 0.07 0.12 rg',
    '/F1 9 Tf',
    '0 -14 Td',
    `(${text(isConvert ? 'Completed' : order.exchangeRate || '—')}) Tj`,
    'ET',
  ];

  if (transaction?.transactionHash) {
    stream.push(
      '0.92 0.95 0.98 rg',
      '36 284 540 20 re f',
      'BT',
      '0.08 0.12 0.2 rg',
      '/F1 9 Tf',
      '46 291 Td',
      `(${text('BLOCKCHAIN TRANSACTION')}) Tj`,
      '0.39 0.46 0.57 rg',
      '/F1 8 Tf',
      '0 -28 Td',
      `(${text('TRANSACTION ID')}) Tj`,
      '0.04 0.07 0.12 rg',
      '/F1 8 Tf',
      '0 -14 Td',
      ...wrap(transaction.transactionHash).flatMap(line => [`(${text(line)}) Tj`, '0 -12 Td']),
      '0.39 0.46 0.57 rg',
      '/F1 8 Tf',
      '0 -8 Td',
      `(${text(`NETWORK: ${transaction.networkName || transaction.networkCode}`)}) Tj`,
      '0 -14 Td',
      `(${text(`CONFIRMATIONS: ${transaction.confirmations}`)}) Tj`,
      '0 -14 Td',
      `(${text(`DETECTED: ${date(transaction.detectedAt)}`)}) Tj`,
      'ET',
    );
  }

  stream.push(
    '0.043 0.067 0.122 rg',
    '0 0 612 66 re f',
    'BT',
    '1 1 1 rg',
    '/F1 10 Tf',
    '190 40 Td',
    `(${text('Thank you for choosing QuickXchange.')}) Tj`,
    '0.62 0.72 0.85 rg',
    '/F1 8 Tf',
    '-36 -18 Td',
    `(${text('quickxchange.net   •   @Quick_change_support')}) Tj`,
    'ET',
  );

  const finalStream = stream.join('\n');
  const objects: Array<Array<string | Uint8Array>> = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >>${logo ? ' /XObject << /Logo 6 0 R >>' : ''} >> /Contents 4 0 R >>`],
    [`<< /Length ${encodePdfText(finalStream).length} >>\nstream\n${finalStream}\nendstream`],
    ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
    ...(logo ? [[
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
      logo.bytes,
      '\nendstream',
    ]] : []),
  ];
  const chunks: Uint8Array[] = [encodePdfText('%PDF-1.4\n%\x80\x81\x82\x83\n')];
  const offsets: number[] = [0];
  let byteLength = chunks[0].length;
  objects.forEach((objectParts, index) => {
    offsets[index + 1] = byteLength;
    const parts = [
      encodePdfText(`${index + 1} 0 obj\n`),
      ...objectParts.map((part) => typeof part === 'string' ? encodePdfText(part) : part),
      encodePdfText('\nendobj\n'),
    ];
    parts.forEach((part) => {
      chunks.push(part);
      byteLength += part.length;
    });
  });
  const xref = byteLength;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    trailer += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(encodePdfText(trailer));
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

export function OrderCompletionSection({
  order,
  trustpilotUrl,
  refreshWarning = false,
}: {
  order: CompletionOrder;
  trustpilotUrl?: string | null;
  refreshWarning?: boolean;
}) {
  const isConvert = order.type === 'instant';
  if (isConvert ? !isCompletedConvert(order) : !isCompletedManualSwap(order, refreshWarning)) return null;

  const completedAt = order.completedAt ||
    optionalOrderString(order, 'providerUpdatedAt') ||
    optionalOrderString(order, 'updatedAt');
  const paymentMethod = order.sourcePaymentMethod?.name || order.paymentDetails?.name || '—';
  const receiveRouteLabel = isConvert ? order.toNetwork || 'Network unavailable' : order.toNetwork || paymentMethod;
  const transaction = order.verifiedFundingTransaction;
  const downloadPdf = async () => {
    const url = URL.createObjectURL(await buildInvoicePdf(order));
    const link = document.createElement('a');
    link.href = url;
    link.download = `quickxchange-invoice-${order.id}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="order-completion-section" data-testid="order-completion-section">
      <div className="order-completion-heading">
        <span className="order-completion-icon"><CheckCircle2 size={22} /></span>
        <div>
          <span className="order-completion-kicker">TRANSACTION COMPLETE</span>
          <h3>{isConvert ? 'Your Convert is complete' : 'Your Swap is complete'}</h3>
          <p>Your receipt is ready. Keep it for your records.</p>
        </div>
      </div>
      <div className="order-completion-actions">
        {trustpilotUrl && (
          <a className="order-completion-trustpilot" href={trustpilotUrl} target="_blank" rel="noreferrer" data-testid="link-trustpilot-review">
            <Star className="trustpilot-star" size={20} fill="currentColor" />
            <span><strong>Review us on Trustpilot</strong><small>Share your experience</small></span>
            <ExternalLink size={15} />
          </a>
        )}
        <button type="button" className="order-completion-button" onClick={downloadPdf} data-testid="button-download-invoice">
          <Download size={16} /> Download PDF
        </button>
        <button type="button" className="order-completion-button secondary" onClick={() => window.print()} data-testid="button-print-invoice">
          <Printer size={16} /> Print
        </button>
      </div>
      <div className="order-invoice-sheet" data-testid="order-invoice">
        <div className="order-invoice-brand">
          <img src={`${basePath}/brand/quickxchange-header-dark.png`} alt="QuickXchange" />
          <div className="order-invoice-brand-copy">
            <strong>Completion Receipt</strong>
            <span className="order-invoice-badge"><CheckCircle2 size={14} /> Completed</span>
          </div>
        </div>
        <div className="order-invoice-title">
          <FileText size={19} className="text-primary shrink-0" />
          <strong>{isConvert ? 'Convert receipt' : 'Swap receipt'}</strong>
          <span>#{order.id}</span>
        </div>
        <div className="order-invoice-route">
          <div>
            <OrderSettlementIdentity assetCode={order.fromAsset} routeLabel={order.fromNetwork} settlementOptionId={order.sourceSettlementOptionId} size="md" compact summaryLogoArtwork />
            <small>You Send</small>
            <strong>{number(order.amount)} {order.fromAsset}</strong>
            <span>{order.fromNetwork || 'Network unavailable'}</span>
          </div>
          <span className="order-invoice-route-arrow" aria-hidden="true"><ArrowRight size={18} /></span>
          <div>
            <OrderSettlementIdentity assetCode={order.toAsset} routeLabel={order.toNetwork} settlementOptionId={order.targetSettlementOptionId} size="md" compact summaryLogoArtwork />
            <small>You Receive</small>
            <strong>{number(order.receiveAmount)} {order.toAsset}</strong>
            <span>{receiveRouteLabel}</span>
          </div>
        </div>
        <div className="order-invoice-section-title">Order Details</div>
        <div className="order-invoice-grid">
          <div><small>Order ID</small><strong className="order-invoice-break">{order.id}</strong></div>
          <div><small>Exchange Type</small><strong>{isConvert ? 'Convert' : 'Swap'}</strong></div>
          <div><small>Created Date</small><strong>{new Date(order.createdAt).toLocaleString()}</strong></div>
          <div><small>{completedAt ? 'Completed Date' : 'Updated Date'}</small><strong>{completedAt ? new Date(completedAt).toLocaleString() : '—'}</strong></div>
          {!isConvert && <div><small>Exchange Rate</small><strong>{order.exchangeRate || '—'}</strong></div>}
          <div><small>Network</small><strong>{order.fromNetwork || '—'}</strong></div>
          <div><small>Status</small><strong className="order-invoice-completed"><CheckCircle2 size={14} /> Completed</strong></div>
        </div>
        {transaction?.transactionHash && (
          <>
            <div className="order-invoice-section-title">Blockchain Transaction</div>
            <div className="order-invoice-meta">
              <div><small>Transaction ID</small><code>{transaction.transactionHash}</code></div>
              <div><small>Network</small><strong>{transaction.networkName || transaction.networkCode}</strong></div>
              <div><small>Confirmations</small><strong>{transaction.confirmations}</strong></div>
              <div><small>Detected</small><strong>{transaction.detectedAt ? new Date(transaction.detectedAt).toLocaleString() : '—'}</strong></div>
            </div>
          </>
        )}
        {order.paymentReference && (
          <div className="order-invoice-meta">
            <div><small>Payment Reference</small><code>{order.paymentReference}</code></div>
          </div>
        )}
        <div className="order-invoice-footer">
          <strong>Thank you for choosing QuickXchange.</strong>
          <span>quickxchange.net</span>
          <span>@Quick_change_support</span>
        </div>
      </div>
    </section>
  );
}