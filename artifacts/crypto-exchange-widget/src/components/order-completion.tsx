import { CheckCircle2, Download, ExternalLink, FileText, Printer, ShieldCheck, Star } from 'lucide-react';
import type { CustomerOrder, ManualPublicOrderStatus, PublicOrderStatus } from '@workspace/api-client-react';
import { basePath, number } from '@/components/shared-app-ui';

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
  const providerReference = optionalOrderString(order, 'providerReference');
  const paymentMethod = order.sourcePaymentMethod?.name || order.paymentDetails?.name || '—';
  const logo = await loadInvoiceLogo();

  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const stream = [
    '0.043 0.067 0.122 rg',
    '0 680 612 112 re f',
    '0.024 0.714 0.831 rg',
    '0 788 612 4 re f',
    ...(logo ? [
      'q',
      '168 0 0 71 44 704 cm',
      '/Logo Do',
      'Q',
    ] : []),
    'BT',
    '0.024 0.714 0.831 rg',
    '/F1 10 Tf',
    `${logo ? '238 727' : '50 735'} Td`,
    `(${escape('COMPLETION RECEIPT / INVOICE')}) Tj`,
    'ET',
    'BT',
    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '50 635 Td',
    `(${escape('ORDER ID')}) Tj`,
    '0 0 0 rg',
    '/F1 12 Tf',
    '0 -14 Td',
    `(${escape(order.id)}) Tj`,
    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '250 14 Td',
    `(${escape('STATUS')}) Tj`,
    '0.133 0.773 0.369 rg',
    '/F1 12 Tf',
    '0 -14 Td',
    `(${escape('Completed')}) Tj`,
    'ET',
    'BT',
    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '50 575 Td',
    `(${escape('CREATED')}) Tj`,
    '0 0 0 rg',
    '/F1 11 Tf',
    '0 -14 Td',
    `(${escape(new Date(order.createdAt).toLocaleString())}) Tj`,

    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '250 14 Td',
    `(${escape(completedAt ? 'COMPLETED' : 'UPDATED')}) Tj`,
    '0 0 0 rg',
    '/F1 11 Tf',
    '0 -14 Td',
    `(${escape(printable(completedAt ? new Date(completedAt).toLocaleString() : '—'))}) Tj`,
    'ET',
    '0.85 0.85 0.85 RG',
    '1 w',
    '50 530 m',
    '562 530 l S',
    'BT',
    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '50 495 Td',
    `(${escape('YOU SEND')}) Tj`,
    '0 0 0 rg',
    '/F1 14 Tf',
    '0 -18 Td',
    `(${escape(`${number(order.amount)} ${order.fromAsset}`)}) Tj`,
    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '0 -14 Td',
    `(${escape(order.fromNetwork || '—')}) Tj`,

    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '250 32 Td',
    `(${escape('YOU RECEIVE')}) Tj`,
    '0 0 0 rg',
    '/F1 14 Tf',
    '0 -18 Td',
    `(${escape(`${number(order.receiveAmount)} ${order.toAsset}`)}) Tj`,
    '0.4 0.4 0.4 rg',
    '/F1 10 Tf',
    '0 -14 Td',
    `(${escape(isConvert ? order.toNetwork || '—' : paymentMethod)}) Tj`,
    'ET',
    '0.85 0.85 0.85 RG',
    '1 w',
    '50 420 m',
    '562 420 l S',
    'BT',
    '0 0 0 rg',
    '/F1 10 Tf',
    '50 385 Td',
  ];

  const details = [];
  if (!isConvert) details.push(`Exchange rate: ${order.exchangeRate || '—'}`);
  if (!isConvert && order.verifiedFundingTransaction?.transactionHash) {
    details.push(`Transaction ID: ${order.verifiedFundingTransaction.transactionHash}`);
  }
  if (order.paymentReference) details.push(`Payment reference: ${order.paymentReference}`);
  if (providerReference) details.push(`Provider reference: ${providerReference}`);

  details.forEach((line) => {
    stream.push(`(${escape(printable(line))}) Tj`, '0 -16 Td');
  });

  stream.push(
    '0.4 0.4 0.4 rg',
    '0 -24 Td',
    `(${escape('Thank you for choosing QuickXchange.')}) Tj`,
    'ET'
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
  const providerReference = optionalOrderString(order, 'providerReference');
  const paymentMethod = order.sourcePaymentMethod?.name || order.paymentDetails?.name || '—';
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
          <img src={`${basePath}/brand/quickxchange-header-dark.png`} className="hidden dark:block print:hidden" alt="QuickXchange" />
          <img src={`${basePath}/brand/quickxchange-header-light.png`} className="block dark:hidden print:block" alt="QuickXchange" />
          <span><ShieldCheck size={14} /> Official completion receipt</span>
        </div>
        <div className="order-invoice-title"><FileText size={19} /><strong>{isConvert ? 'Convert invoice' : 'Swap invoice'}</strong><span>#{order.id}</span></div>
        <div className="order-invoice-grid">
          <div><small>Status</small><strong className="text-emerald-600">Completed</strong></div>
          <div><small>Created</small><strong>{new Date(order.createdAt).toLocaleString()}</strong></div>
          <div><small>{completedAt ? 'Completed' : 'Updated'}</small><strong>{completedAt ? new Date(completedAt).toLocaleString() : '—'}</strong></div>
          {!isConvert && <div><small>Exchange rate</small><strong>{order.exchangeRate || '—'}</strong></div>}
        </div>
        <div className="order-invoice-route">
          <div><small>You Send</small><strong>{number(order.amount)} {order.fromAsset}</strong><span>{order.fromNetwork || 'Network unavailable'}</span></div>
          <div><small>You Receive</small><strong>{number(order.receiveAmount)} {order.toAsset}</strong><span>{isConvert ? order.toNetwork || 'Network unavailable' : paymentMethod}</span></div>
        </div>
         {(order.verifiedFundingTransaction || order.paymentReference || providerReference) && (
          <div className="order-invoice-meta">
             {!isConvert && order.verifiedFundingTransaction && <div><small>Transaction ID</small><code>{order.verifiedFundingTransaction.transactionHash}</code></div>}
            {order.paymentReference && <div><small>Payment reference</small><code>{order.paymentReference}</code></div>}
            {providerReference && <div><small>Provider reference</small><code>{providerReference}</code></div>}
          </div>
        )}
      </div>
    </section>
  );
}