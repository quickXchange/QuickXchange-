import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { useEffect, useState } from 'react';
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
import { usePublishedTelegramSupportUrl } from '@/lib/telegram-support';

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
  const { t: uiT, tx: uiText } = useCustomerI18n();

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
    <a className="order-completion-review" href={reviewUrl} target="_blank" rel="noopener noreferrer" aria-label={uiT("customer.mffa99e99b108")} data-testid="link-trustpilot-review">
      <span className="order-completion-review-icon"><SiTrustpilot aria-hidden="true" /></span>
      <span className="order-completion-review-copy">
        <span>{uiT("customer.m772de4944ac9")}{' '}<strong><SiTrustpilot aria-hidden="true" /> Trustpilot</strong></span>
        <small>{uiT("customer.m121b468e819e")}</small>
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
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const telegramSupportUrl = usePublishedTelegramSupportUrl();
  const isConvert = order.type === 'instant';
  useEffect(() => {
    if (!telegramSupportUrl || !isCompletedInvoiceOrder(order, refreshWarning)) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('invoice') !== '1') return;
    // Consume the one-time email action before starting, so refetches and
    // remounts cannot trigger duplicate downloads.
    url.searchParams.delete('invoice');
    window.history.replaceState(window.history.state, '', url);
    setExporting(true);
    setExportError(null);
    void downloadInvoicePdf(invoiceSnapshot(order), telegramSupportUrl)
      .catch(() => setExportError('The receipt could not be generated. Please try again.'))
      .finally(() => setExporting(false));
  }, [order, refreshWarning, telegramSupportUrl]);
  if (!isCompletedInvoiceOrder(order, refreshWarning)) return null;

  const invoice = invoiceSnapshot(order);
  const downloadPdf = async () => {
    if (!telegramSupportUrl) {
      setExportError('Support details are still loading. Please try again.');
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      await downloadInvoicePdf(invoice, telegramSupportUrl);
    } catch {
      setExportError('The receipt could not be generated. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const printPdf = async () => {
    if (!telegramSupportUrl) {
      setExportError('Support details are still loading. Please try again.');
      return;
    }
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
      const url = URL.createObjectURL(await buildInvoicePdf(invoice, telegramSupportUrl));
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
          <span className="order-completion-kicker">{uiT("customer.mfefb61f1f162")}</span>
          <h3>{isConvert ? uiT("customer.m6cf24c671946") : uiT("customer.m05e92b7be6e2")}</h3>
          <p>{uiT("customer.m95271b680fd1")}</p>
        </div>
      </div>
      <div className="order-completion-actions">
        <button type="button" className="order-completion-button" onClick={downloadPdf} disabled={exporting || !telegramSupportUrl} data-testid="button-download-invoice">
          <Download size={16} /> {!telegramSupportUrl ? uiT("customer.maf6cade28fed") : exporting ? uiT("customer.mada4d2485dce") : uiT("customer.m6183be0883d2")}
        </button>
        <button type="button" className="order-completion-button secondary" onClick={printPdf} disabled={exporting || !telegramSupportUrl} data-testid="button-print-invoice">
          <Printer size={16} /> {!telegramSupportUrl ? uiT("customer.m44bf1f9a57cf") : uiT("customer.mdf0fe79898ef")}
        </button>
      </div>
      {exportError && <p className="px-5 pb-4 text-sm text-destructive" role="alert">{uiText(exportError)}</p>}
      <CompletionReview configuredUrl={trustpilotUrl} />
    </section>
  );
}