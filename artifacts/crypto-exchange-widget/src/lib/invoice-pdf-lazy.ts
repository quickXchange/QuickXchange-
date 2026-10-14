import type { InvoiceSnapshot } from './invoice-snapshot';

// Keep the PDF renderer and font engine off customer/Admin navigation paths.
// import() is shared by the module loader; failures still reach existing UI errors.
export async function buildInvoicePdf(invoice: InvoiceSnapshot, supportTelegramUrl: string): Promise<Blob> {
  const renderer = await import('./invoice-pdf');
  return renderer.buildInvoicePdf(invoice, supportTelegramUrl);
}

export async function downloadInvoicePdf(invoice: InvoiceSnapshot, supportTelegramUrl: string): Promise<void> {
  const renderer = await import('./invoice-pdf');
  return renderer.downloadInvoicePdf(invoice, supportTelegramUrl);
}
