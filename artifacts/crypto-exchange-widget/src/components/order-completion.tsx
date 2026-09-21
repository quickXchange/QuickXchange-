import { CheckCircle2, Download, ExternalLink, FileText, Printer, ShieldCheck } from 'lucide-react';
import type { CustomerOrder, PublicOrderStatus } from '@workspace/api-client-react';
import { basePath, number } from '@/components/shared-app-ui';

type CompletionOrder = CustomerOrder | PublicOrderStatus;
const officialLogoUrl = `${basePath}/brand/quickxchange-official.png`;

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

async function invoiceLogoJpeg(): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const image = new Image();
  image.src = officialLogoUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Invoice logo rendering is unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Invoice logo encoding failed.')), 'image/jpeg', 0.96);
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

function encoded(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function buildInvoicePdf(order: CompletionOrder): Promise<Blob> {
  const logo = await invoiceLogoJpeg();
  const isConvert = order.type === 'instant';
  const completedAt = order.completedAt ||
    optionalOrderString(order, 'providerUpdatedAt') ||
    optionalOrderString(order, 'updatedAt');
  const providerReference = optionalOrderString(order, 'providerReference');
  const paymentMethod = order.sourcePaymentMethod?.name || order.paymentDetails?.name || '—';
  const lines = [
    'COMPLETION RECEIPT / INVOICE',
    '',
    `Order ID: ${order.id}`,
    'Status: Completed',
    `Created: ${new Date(order.createdAt).toLocaleString()}`,
    `Completed: ${completedAt ? new Date(completedAt).toLocaleString() : '—'}`,
    '',
    `You Send: ${number(order.amount)} ${order.fromAsset} / ${order.fromNetwork || '—'}`,
    `You Receive: ${number(order.receiveAmount)} ${order.toAsset}${isConvert ? ` / ${order.toNetwork || '—'}` : ''}`,
    ...(!isConvert ? [`Payment method: ${paymentMethod}`] : []),
    ...(!isConvert ? [`Exchange rate: ${order.exchangeRate || '—'}`] : []),
    ...(order.transactionHash ? [`Transaction hash: ${order.transactionHash}`] : []),
    ...(order.paymentReference ? [`Payment reference: ${order.paymentReference}`] : []),
    ...(providerReference ? [`Provider reference: ${providerReference}`] : []),
    '',
    'Thank you for choosing QuickXchange.',
  ];
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = [
    'BT',
    '/F1 18 Tf',
    '50 760 Td',
    `(${escape(lines[0])}) Tj`,
    '/F1 11 Tf',
    '0 -24 Td',
    ...lines.slice(1).flatMap(line => [`(${escape(printable(line))}) Tj`, '0 -17 Td']),
    'ET',
  ].join('\n');
  const brandedStream = [
    'q',
    '205 0 0 205 50 565 cm',
    '/Logo Do',
    'Q',
    stream.replace('50 760 Td', '50 540 Td'),
  ].join('\n');
  const imageObject = concatBytes([
    encoded(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.byteLength} >>\nstream\n`),
    logo.bytes,
    encoded('\nendstream'),
  ]);
  const objects: Uint8Array[] = [
    encoded('<< /Type /Catalog /Pages 2 0 R >>'),
    encoded('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encoded('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Logo 6 0 R >> >> /Contents 4 0 R >>'),
    encoded(`<< /Length ${encoded(brandedStream).byteLength} >>\nstream\n${brandedStream}\nendstream`),
    encoded('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    imageObject,
  ];
  const chunks: Uint8Array[] = [encoded('%PDF-1.4\n')];
  let byteLength = chunks[0].byteLength;
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = byteLength;
    const chunk = concatBytes([
      encoded(`${index + 1} 0 obj\n`),
      object,
      encoded('\nendobj\n'),
    ]);
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  });
  const xref = byteLength;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    trailer += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(encoded(trailer));
  return new Blob([concatBytes(chunks).buffer], { type: 'application/pdf' });
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
    URL.revokeObjectURL(url);
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
            <span className="trustpilot-star">★</span>
            <span><strong>Review us on Trustpilot</strong><small>Share your experience</small></span>
            <ExternalLink size={15} />
          </a>
        )}
        <button type="button" className="order-completion-button" onClick={() => void downloadPdf()} data-testid="button-download-invoice">
          <Download size={16} /> Download PDF
        </button>
        <button type="button" className="order-completion-button secondary" onClick={() => window.print()} data-testid="button-print-invoice">
          <Printer size={16} /> Print
        </button>
      </div>
      <div className="order-invoice-sheet" data-testid="order-invoice">
        <div className="order-invoice-brand">
          <span className="order-invoice-logo"><img src={officialLogoUrl} alt="QuickXchange" /></span>
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
        {(order.transactionHash || order.paymentReference || providerReference) && (
          <div className="order-invoice-meta">
            {order.transactionHash && <div><small>Transaction hash</small><code>{order.transactionHash}</code></div>}
            {order.paymentReference && <div><small>Payment reference</small><code>{order.paymentReference}</code></div>}
            {providerReference && <div><small>Provider reference</small><code>{providerReference}</code></div>}
          </div>
        )}
      </div>
    </section>
  );
}