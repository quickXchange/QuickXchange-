import { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Printer } from 'lucide-react';
import { SiTrustpilot } from 'react-icons/si';
import {
  getGetPublishedSiteContentQueryKey,
  getGetPublicNotificationSettingsQueryKey,
  useGetPublishedSiteContent,
  useGetPublicNotificationSettings,
} from '@workspace/api-client-react';
import { buildInvoicePdf, downloadInvoicePdf } from '@/lib/invoice-pdf';
import { invoiceSnapshot, isCompletedInvoiceOrder, type InvoiceOrder } from '@/lib/invoice-snapshot';

function trustpilotDestination(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*trustpilot\.com$/i.test(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function CompletionReview({ configuredUrl }: { configuredUrl?: string | null }) {
  const published = useGetPublishedSiteContent({
    query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 },
  });
  const notifications = useGetPublicNotificationSettings({
    query: { queryKey: getGetPublicNotificationSettingsQueryKey(), staleTime: 60_000 },
  });
  const site = published.data;
  const configuredItem = site?.socialTrust?.items?.find(item =>
    item.enabled && (/trustpilot/i.test(item.name) || Boolean(trustpilotDestination(item.href))));
  const partner = site?.partnerLogos?.find(logo =>
    logo.enabled && /trustpilot/i.test(logo.name) && logo.link);
  const reviewUrl = [
    configuredItem?.href,
    notifications.data?.trustpilotReviewUrl,
    configuredUrl,
    partner?.link,
  ].map(trustpilotDestination).find(Boolean);
  if (!reviewUrl) return null;

  return (
    <a className="order-completion-review" href={reviewUrl} target="_blank" rel="noopener noreferrer" aria-label="Review us on Trustpilot" data-testid="link-trustpilot-review">
      <span className="order-completion-review-icon"><SiTrustpilot aria-hidden="true" /></span>
      <span className="order-completion-review-copy">
        <span>Review us on <strong><SiTrustpilot aria-hidden="true" /> Trustpilot</strong></span>
        <small>Share your experience with QuickXchange</small>
      </span>
      <ExternalLink size={16} aria-hidden="true" />
    </a>
  );
}

export function OrderCompletionSection({
  order,
  trustpilotUrl,
  refreshWarning = false,
}: {
  order: InvoiceOrder;
  trustpilotUrl?: string | null;
  refreshWarning?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const isConvert = order.type === 'instant';
  if (!isCompletedInvoiceOrder(order, refreshWarning)) return null;

  const invoice = invoiceSnapshot(order);
  const downloadPdf = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadInvoicePdf(invoice);
    } catch {
      setExportError('The invoice could not be generated. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const printPdf = async () => {
    // Open synchronously on the click, before fetching fonts and building the
    // document. Otherwise browsers may block the PDF preview as a popup.
    const preview = window.open('', '_blank');
    if (!preview) {
      setExportError('Please allow pop-ups to print your invoice.');
      return;
    }
    preview.opener = null;
    preview.document.title = 'Preparing QuickXchange invoice';
    preview.document.body.textContent = 'Preparing your invoice…';
    setExporting(true);
    setExportError(null);
    try {
      const url = URL.createObjectURL(await buildInvoicePdf(invoice));
      const frame = preview.document.createElement('iframe');
      frame.src = url;
      frame.title = `QuickXchange invoice ${invoice.id}`;
      frame.style.cssText = 'width:100vw;height:100vh;border:0;display:block';
      preview.document.body.style.margin = '0';
      preview.document.body.replaceChildren(frame);
      preview.document.title = `QuickXchange Invoice ${invoice.id}`;
      window.setTimeout(() => URL.revokeObjectURL(url), 600_000);
    } catch {
      preview.close();
      setExportError('The invoice could not be generated. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="order-completion-section" data-testid="order-completion-section">
      <div className="order-completion-heading">
        <span className="order-completion-icon"><CheckCircle2 size={22} /></span>
        <div>
          <span className="order-completion-kicker">TRANSACTION COMPLETE</span>
          <h3>{isConvert ? 'Your Convert is complete' : 'Your Swap is complete'}</h3>
          <p>Your invoice is ready. Keep it for your records.</p>
        </div>
      </div>
      <div className="order-completion-actions">
        <button type="button" className="order-completion-button" onClick={downloadPdf} disabled={exporting} data-testid="button-download-invoice">
          <Download size={16} /> {exporting ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        <button type="button" className="order-completion-button secondary" onClick={printPdf} disabled={exporting} data-testid="button-print-invoice">
          <Printer size={16} /> Print
        </button>
      </div>
      {exportError && <p className="px-5 pb-4 text-sm text-destructive" role="alert">{exportError}</p>}
      <CompletionReview configuredUrl={trustpilotUrl} />
    </section>
  );
}