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
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.45, color: LINE });
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
    page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 104, width: CONTENT_WIDTH, height: 82, color: NAVY });
    page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 24, width: CONTENT_WIDTH * .67, height: 2, color: CYAN });
    page.drawRectangle({ x: MARGIN + CONTENT_WIDTH * .67, y: PAGE_HEIGHT - 24, width: CONTENT_WIDTH * .33, height: 2, color: rgb(.486, .173, 1) });
    page.drawImage(logo, { x: MARGIN + 12, y: PAGE_HEIGHT - 88, width: 124, height: 52.45 });
    page.drawText('INVOICE', { x: PAGE_WIDTH - MARGIN - 12 - bold.widthOfTextAtSize('INVOICE', 19), y: PAGE_HEIGHT - 49, font: bold, size: 19, color: WHITE });
    const rightX = PAGE_WIDTH - MARGIN - 223;
    lines(page, `Invoice / Order No. ${invoice.id}`, rightX, PAGE_HEIGHT - 58, 211, regular, 8.2, WHITE, 11);
    const finished = dateTime(invoice.completedAt);
    if (finished) lines(page, `Completion date  ${finished}`, rightX, PAGE_HEIGHT - 80, 211, regular, 8.2, rgb(.755, .835, .929), 11);
    y = PAGE_HEIGHT - 124;
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
    y -= height + 2;
    ensure(51);
  }
  y -= 9;
  section('EXCHANGE / INVOICE ITEMS', 140);

  const x1 = MARGIN + 12;
  const x2 = MARGIN + 229;
  const x3 = MARGIN + 365;
  page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_WIDTH, height: 20, color: PALE, borderColor: LINE, borderWidth: .45 });
  page.drawText('DESCRIPTION', { x: x1, y: y - 11, font: bold, size: 7.5, color: MUTED });
  page.drawText('YOU SEND', { x: x2, y: y - 11, font: bold, size: 7.5, color: MUTED });
  page.drawText('YOU RECEIVE', { x: x3, y: y - 11, font: bold, size: 7.5, color: MUTED });
  y -= 24;

  const description = `Exchange ${invoice.fromAsset} to ${invoice.toAsset}`;
  const sent = `${formatDisplayAmount(invoice.sendAmount)} ${invoice.fromAsset}`;
  const received = `${formatDisplayAmount(invoice.receiveAmount)} ${invoice.toAsset}`;
  const descriptionHeight = wrapped(description, bold, 9.5, 201).length * 15;
  const sendHeight = wrapped(sent, bold, 9, 117).length * 14 +
    (invoice.sendNetwork ? wrapped(`Network: ${invoice.sendNetwork}`, regular, 7.8, 117).length * 11 + 7 : 0);
  const receiveHeight = wrapped(received, bold, 9, 130).length * 14 +
    (invoice.receiveMethod ? wrapped(invoice.receiveMethod, regular, 7.8, 130).length * 11 + 7 : 0);
  const itemHeight = Math.max(28, descriptionHeight, sendHeight, receiveHeight) + 10;
  ensure(itemHeight + 125);
  lines(page, description, x1, y - 5, 201, regular, 9.5);
  const sendUsed = lines(page, sent, x2, y - 5, 117, regular, 9);
  if (invoice.sendNetwork) lines(page, `Network: ${invoice.sendNetwork}`, x2, y - 5 - sendUsed - 5, 117, regular, 7.8, MUTED, 11);
  const receiveUsed = lines(page, received, x3, y - 5, 130, regular, 9);
  if (invoice.receiveMethod) lines(page, invoice.receiveMethod, x3, y - 5 - receiveUsed - 5, 130, regular, 7.8, MUTED, 11);
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
  const totalText = `${formatDisplayAmount(invoice.receiveAmount)} ${invoice.toAsset}`;
  const totalSize = bold.widthOfTextAtSize(totalText, 10) <= 215 ? 10 : 8.5;
  const totalHeight = Math.max(30, wrapped(totalText, bold, totalSize, 215).length * 13 + 16);
  // Keep unusually long saved amounts readable rather than clipping the compact row.
  ensure(totalHeight + 12);
  page.drawRectangle({ x: MARGIN + 8, y: y - totalHeight, width: CONTENT_WIDTH - 16, height: totalHeight, color: PALE, borderColor: LINE, borderWidth: .45 });
  page.drawText('FINAL RECEIVE / TOTAL', { x: MARGIN + 15, y: y - 19, font: regular, size: 8.5, color: MUTED });
  lines(page, totalText, MARGIN + 278, y - 8, 215, bold, totalSize, DARK, 13);
  y -= totalHeight + 12;

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