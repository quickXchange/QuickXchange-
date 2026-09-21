import { CheckCircle2, Download, ExternalLink, FileText, Printer, ShieldCheck } from 'lucide-react';
import type { CustomerOrder, PublicOrderStatus } from '@workspace/api-client-react';
import { basePath, number } from '@/components/shared-app-ui';

type CompletionOrder = CustomerOrder | PublicOrderStatus;

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

function buildInvoicePdf(order: CompletionOrder): Blob {
  const completedAt = order.completedAt || undefined;
  const paymentMethod = order.sourcePaymentMethod?.name || order.paymentDetails?.name || '—';
  const lines = [
    'QUICKXCHANGE',
    'COMPLETION RECEIPT / INVOICE',
    '',
    `Order ID: ${order.id}`,
    'Status: Completed',
    `Created: ${new Date(order.createdAt).toLocaleString()}`,
    `Completed: ${completedAt ? new Date(completedAt).toLocaleString() : '—'}`,
    '',
    `You Send: ${number(order.amount)} ${order.fromAsset} / ${order.fromNetwork || '—'}`,
    `You Receive: ${number(order.receiveAmount)} ${order.toAsset}`,
    `Payment method: ${paymentMethod}`,
    `Exchange rate: ${order.exchangeRate || '—'}`,
    ...(order.transactionHash ? [`Transaction hash: ${order.transactionHash}`] : []),
    ...(order.paymentReference ? [`Payment reference: ${order.paymentReference}`] : []),
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
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
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
  if (!isCompletedManualSwap(order, refreshWarning)) return null;

  const paymentMethod = order.sourcePaymentMethod?.name || order.paymentDetails?.name || '—';
  const downloadPdf = () => {
    const url = URL.createObjectURL(buildInvoicePdf(order));
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
          <h3>Your Swap is complete</h3>
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
        <button type="button" className="order-completion-button" onClick={downloadPdf} data-testid="button-download-invoice">
          <Download size={16} /> Download PDF
        </button>
        <button type="button" className="order-completion-button secondary" onClick={() => window.print()} data-testid="button-print-invoice">
          <Printer size={16} /> Print
        </button>
      </div>
      <div className="order-invoice-sheet" data-testid="order-invoice">
        <div className="order-invoice-brand">
          <img src={`${basePath}/brand/quickxchange-header-light.png`} alt="QuickXchange" />
          <span><ShieldCheck size={14} /> Official completion receipt</span>
        </div>
        <div className="order-invoice-title"><FileText size={19} /><strong>Swap invoice</strong><span>#{order.id}</span></div>
        <div className="order-invoice-grid">
          <div><small>Status</small><strong className="text-emerald-600">Completed</strong></div>
          <div><small>Created</small><strong>{new Date(order.createdAt).toLocaleString()}</strong></div>
          <div><small>Completed</small><strong>{order.completedAt ? new Date(order.completedAt).toLocaleString() : '—'}</strong></div>
          <div><small>Exchange rate</small><strong>{order.exchangeRate || '—'}</strong></div>
        </div>
        <div className="order-invoice-route">
          <div><small>You Send</small><strong>{number(order.amount)} {order.fromAsset}</strong><span>{order.fromNetwork || 'Network unavailable'}</span></div>
          <div><small>You Receive</small><strong>{number(order.receiveAmount)} {order.toAsset}</strong><span>{paymentMethod}</span></div>
        </div>
        {(order.transactionHash || order.paymentReference) && (
          <div className="order-invoice-meta">
            {order.transactionHash && <div><small>Transaction hash</small><code>{order.transactionHash}</code></div>}
            {order.paymentReference && <div><small>Payment reference</small><code>{order.paymentReference}</code></div>}
          </div>
        )}
      </div>
    </section>
  );
}