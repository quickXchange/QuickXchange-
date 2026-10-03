import { formatDisplayAmount } from '@workspace/amount-format';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFPage, type PDFFont, rgb } from 'pdf-lib';
import { normalizeTelegramSupportUrl } from '@workspace/api-zod';
import { basePath } from '@/components/shared-app-ui';
import type { InvoiceSnapshot } from './invoice-snapshot';

const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 43;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const NAVY = rgb(0.047, 0.090, 0.161);
const DARK = rgb(0.094, 0.153, 0.243);
const MUTED = rgb(0.376, 0.447, 0.545);
const CYAN = rgb(0.024, 0.714, 0.831);
const PALE = rgb(0.953, 0.973, 0.992);
const LINE = rgb(0.855, 0.894, 0.937);
const WHITE = rgb(1, 1, 1);
const assets = `${basePath}/brand/invoice`;

async function asset(name: string): Promise<Uint8Array> {
  const response = await fetch(`${assets}/${name}`);
  if (!response.ok) throw new Error(`Could not load invoice asset ${name}.`);
  return new Uint8Array(await response.arrayBuffer());
}

function dateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(date)} UTC`;
}

function wrapped(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const letter of Array.from(word)) {
        if (line && font.widthOfTextAtSize(line + letter, size) > width) {
          lines.push(line);
          line = '';
        }
        line += letter;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

function lines(
  page: PDFPage, text: string, x: number, top: number, width: number,
  font: PDFFont, size: number, color = DARK, lineHeight = size + 4,
): number {
  const chunks = wrapped(text, font, size, width);
  chunks.forEach((chunk, index) => page.drawText(chunk, {
    x, y: top - size - index * lineHeight, font, size, color,
  }));
  return chunks.length * lineHeight;
}

function rule(page: PDFPage, y: number) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.8, color: LINE });
}

/**
 * Generates a single template for completed Swap and Convert orders. All
 * financial and customer-entered values come only from the saved order
 * projection; this renderer never queries current pricing or payment config.
 */
export async function buildInvoicePdf(invoice: InvoiceSnapshot, supportTelegramUrl: string): Promise<Blob> {
  const canonicalSupportUrl = normalizeTelegramSupportUrl(supportTelegramUrl);
  if (!canonicalSupportUrl || canonicalSupportUrl !== supportTelegramUrl) {
    throw new Error('A resolved Telegram support URL is required to generate this invoice.');
  }
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    asset('DejaVuSans.ttf'), asset('DejaVuSans-Bold.ttf'), asset('quickxchange-v1.png'),
  ]);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const logo = await doc.embedPng(logoBytes);
  doc.setTitle(`QuickXchange Invoice ${invoice.id}`);
  doc.setAuthor('QuickXchange');
  const recordedAt = new Date(invoice.completedAt || invoice.createdAt);
  if (!Number.isNaN(recordedAt.getTime())) {
    doc.setCreationDate(recordedAt);
    doc.setModificationDate(recordedAt);
  }

  let page!: PDFPage;
  let y = 0;
  const drawPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 125, width: PAGE_WIDTH, height: 125, color: NAVY });
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 4, width: PAGE_WIDTH * .67, height: 4, color: CYAN });
    page.drawRectangle({ x: PAGE_WIDTH * .67, y: PAGE_HEIGHT - 4, width: PAGE_WIDTH * .33, height: 4, color: rgb(.486, .173, 1) });
    page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - 93, width: 152, height: 64.3 });
    page.drawText('INVOICE', { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize('INVOICE', 23), y: PAGE_HEIGHT - 58, font: bold, size: 23, color: WHITE });
    const rightX = PAGE_WIDTH - MARGIN - 223;
    lines(page, `Invoice / Order No. ${invoice.id}`, rightX, PAGE_HEIGHT - 69, 223, regular, 8.2, WHITE, 12);
    const finished = dateTime(invoice.completedAt);
    if (finished) lines(page, `Completion date  ${finished}`, rightX, PAGE_HEIGHT - 91, 223, regular, 8.2, rgb(.755, .835, .929), 12);
    y = PAGE_HEIGHT - 143;
  };
  const ensure = (height: number) => {
    if (y - height < 83) drawPage();
  };
  const section = (title: string, reserve = 60) => {
    ensure(reserve);
    page.drawText(title, { x: MARGIN, y, font: bold, size: 10, color: DARK });
    y -= 12;
    rule(page, y);
    y -= 12;
  };
  const pair = (label: string, value: string, x: number, width: number, top: number): number => {
    lines(page, label.toUpperCase(), x, top, width, bold, 7.3, MUTED, 10);
    const valueSize = label === 'Order ID' && value.length > 24 ? 7.8 : 9.8;
    return lines(page, value, x, top - 14, width, regular, valueSize, DARK, 14) + 15;
  };
  drawPage();

  section('PAYMENT DETAILS', 106);
  const details = [
    ['Status', 'Completed'],
    ['Payment / Completed Date', dateTime(invoice.completedAt)],
    ['Order ID', invoice.id],
    ['Exchange Type', invoice.exchangeType],
    ['Created Date', dateTime(invoice.createdAt)],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  for (let index = 0; index < details.length; index += 2) {
    const first = details[index];
    const second = details[index + 1];
    const height = Math.max(
      pair(first[0], first[1], MARGIN + 12, 228, y),
      second ? pair(second[0], second[1], MARGIN + 272, 225, y) : 0,
      32,
    );
    y -= height + 5;
    ensure(51);
  }
  y -= 9;
  section('EXCHANGE / INVOICE ITEMS', 140);

  const x1 = MARGIN + 12;
  const x2 = MARGIN + 229;
  const x3 = MARGIN + 365;
  page.drawRectangle({ x: MARGIN, y: y - 25, width: CONTENT_WIDTH, height: 27, color: NAVY });
  page.drawText('DESCRIPTION', { x: x1, y: y - 16, font: bold, size: 7.5, color: WHITE });
  page.drawText('YOU SEND', { x: x2, y: y - 16, font: bold, size: 7.5, color: WHITE });
  page.drawText('YOU RECEIVE', { x: x3, y: y - 16, font: bold, size: 7.5, color: WHITE });
  y -= 36;

  const description = `Exchange ${invoice.fromAsset} to ${invoice.toAsset}`;
  const sent = `${formatDisplayAmount(invoice.sendAmount)} ${invoice.fromAsset}`;
  const received = `${formatDisplayAmount(invoice.receiveAmount)} ${invoice.toAsset}`;
  const descriptionHeight = wrapped(description, bold, 9.5, 201).length * 15;
  const sendHeight = wrapped(sent, bold, 9, 117).length * 14 +
    (invoice.sendNetwork ? wrapped(`Network: ${invoice.sendNetwork}`, regular, 7.8, 117).length * 11 + 7 : 0);
  const receiveHeight = wrapped(received, bold, 9, 130).length * 14 +
    (invoice.receiveMethod ? wrapped(invoice.receiveMethod, regular, 7.8, 130).length * 11 + 7 : 0);
  const itemHeight = Math.max(49, descriptionHeight, sendHeight, receiveHeight) + 15;
  ensure(itemHeight + 125);
  page.drawRectangle({ x: MARGIN, y: y - itemHeight, width: CONTENT_WIDTH, height: itemHeight, color: PALE });
  lines(page, description, x1, y - 14, 201, bold, 9.5);
  const sendUsed = lines(page, sent, x2, y - 14, 117, bold, 9);
  if (invoice.sendNetwork) lines(page, `Network: ${invoice.sendNetwork}`, x2, y - 14 - sendUsed - 5, 117, regular, 7.8, MUTED, 11);
  const receiveUsed = lines(page, received, x3, y - 14, 130, bold, 9);
  if (invoice.receiveMethod) lines(page, invoice.receiveMethod, x3, y - 14 - receiveUsed - 5, 130, regular, 7.8, MUTED, 11);
  y -= itemHeight + 11;

  const summary = [
    ...(invoice.rate ? [['Exchange Rate', `1 ${invoice.fromAsset} = ${invoice.rate} ${invoice.toAsset}`]] : []),
    ...(invoice.fee ? [['Fee', `${formatDisplayAmount(invoice.fee.amount)} ${invoice.fee.asset}`]] : []),
  ];
  for (const [label, value] of summary) {
    const rowHeight = Math.max(24, wrapped(value, regular, 8.7, 238).length * 13 + 8);
    ensure(rowHeight + 70);
    lines(page, label, MARGIN + 12, y - 3, 190, regular, 8.7, MUTED);
    lines(page, value, MARGIN + 254, y - 3, 242, regular, 8.7, DARK, 13);
    y -= rowHeight;
    rule(page, y);
    y -= 6;
  }
  ensure(55);
  page.drawRectangle({ x: MARGIN, y: y - 48, width: CONTENT_WIDTH, height: 48, color: NAVY });
  page.drawText('FINAL RECEIVE / TOTAL', { x: MARGIN + 15, y: y - 29, font: bold, size: 9, color: WHITE });
  const totalText = `${formatDisplayAmount(invoice.receiveAmount)} ${invoice.toAsset}`;
  const totalSize = bold.widthOfTextAtSize(totalText, 12) <= 226 ? 12 : 9;
  lines(page, totalText, MARGIN + 278, y - 12, 215, bold, totalSize, WHITE, 15);
  y -= 63;

  if (invoice.receivingFields.length) {
    section('PAYMENT / RECEIVING INFORMATION', 70);
    for (const { label, value } of invoice.receivingFields) {
      const valueLines = wrapped(value, regular, 9, CONTENT_WIDTH - 200);
      const wholeHeight = Math.max(29,
        wrapped(label.toUpperCase(), bold, 7.5, 145).length * 11 + 9,
        valueLines.length * 13 + 11);
      if (wholeHeight <= PAGE_HEIGHT - 226 && y - wholeHeight < 83) drawPage();
      let offset = 0;
      do {
        const partLabel = `${label}${offset ? ' (continued)' : ''}`.toUpperCase();
        const labelHeight = wrapped(partLabel, bold, 7.5, 145).length * 11 + 9;
        const capacity = Math.floor((y - 83 - 11) / 13);
        if (capacity < 2 || y - labelHeight < 83) {
          drawPage();
          continue;
        }
        const count = Math.min(capacity, valueLines.length - offset);
        const height = Math.max(29, labelHeight, count * 13 + 11);
        if (y - height < 83) {
          drawPage();
          continue;
        }
        lines(page, partLabel, MARGIN + 12, y - 3, 145, bold, 7.5, MUTED, 11);
        lines(page, valueLines.slice(offset, offset + count).join('\n'),
          MARGIN + 187, y - 3, CONTENT_WIDTH - 200, regular, 9, DARK, 13);
        offset += count;
        y -= height;
        rule(page, y);
        y -= 4;
      } while (offset < valueLines.length);
    }
  }

  if (invoice.transactionHash) {
    section('TRANSACTION DETAILS', 55);
    const label = invoice.transactionLabel || 'Transaction ID';
    const valueLines = wrapped(invoice.transactionHash, regular, 9, CONTENT_WIDTH - 200);
    let offset = 0;
    do {
      const capacity = Math.floor((y - 83 - 11) / 13);
      if (capacity < 2) {
        drawPage();
        continue;
      }
      const count = Math.min(capacity, valueLines.length - offset);
      const height = Math.max(29, count * 13 + 11);
      lines(page, offset ? `${label} (continued)` : label,
        MARGIN + 12, y - 3, 145, bold, 7.5, MUTED, 11);
      lines(page, valueLines.slice(offset, offset + count).join('\n'),
        MARGIN + 187, y - 3, CONTENT_WIDTH - 200, regular, 9, DARK, 13);
      offset += count;
      y -= height;
      rule(page, y);
      y -= 4;
    } while (offset < valueLines.length);
  }

  doc.getPages().forEach((printedPage, index) => {
    printedPage.drawLine({ start: { x: MARGIN, y: 74 }, end: { x: PAGE_WIDTH - MARGIN, y: 74 }, thickness: .8, color: LINE });
    printedPage.drawText('Thank you for choosing QuickXchange.', { x: MARGIN, y: 55, font: bold, size: 8.5, color: DARK });
    printedPage.drawText('quickxchange.net', { x: MARGIN, y: 38, font: regular, size: 8, color: MUTED });
    printedPage.drawText(`Support: ${canonicalSupportUrl}`, { x: MARGIN + 98, y: 38, font: regular, size: 8, color: MUTED });
    const pageLabel = `${index + 1} / ${doc.getPageCount()}`;
    printedPage.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageLabel, 8),
      y: 38, font: regular, size: 8, color: MUTED,
    });
  });
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export async function downloadInvoicePdf(invoice: InvoiceSnapshot, supportTelegramUrl: string): Promise<void> {
  const url = URL.createObjectURL(await buildInvoicePdf(invoice, supportTelegramUrl));
  const link = document.createElement('a');
  link.href = url;
  link.download = `quickxchange-invoice-${invoice.id}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}