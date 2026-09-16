import { createHash } from 'node:crypto';

export interface CoverSystemResult {
  svg: string;
  buffer: Buffer;
  template: string;
  detectedAssets: string[];
}

export interface CoverSystemOptions {
  title: string;
  topic?: string;
  category?: string;
  layout?: string;
}

class PRNG {
  private hash: string;
  private cursor: number;
  constructor(seed: string) {
    this.hash = createHash('sha256').update(seed).digest('hex');
    this.cursor = 0;
  }
  next() {
    if (this.cursor >= this.hash.length - 4) {
      this.hash = createHash('sha256').update(this.hash).digest('hex');
      this.cursor = 0;
    }
    const val = parseInt(this.hash.substring(this.cursor, this.cursor + 4), 16);
    this.cursor += 4;
    return val / 65535;
  }
  range(min: number, max: number) {
    return min + this.next() * (max - min);
  }
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function detectCategory(title: string, category?: string, topic?: string): string {
  const t = `${title} ${category || ''} ${topic || ''}`.toLowerCase();
  const categoryText = (category || '').toLowerCase();

  if (/\b(swap|convert|exchange)\b/.test(categoryText)) return 'swap';
  if (/\b(security|safety)\b/.test(categoryText)) return 'security';
  if (/\b(guide|how to|tutorial|learn)\b/.test(categoryText)) return 'guides';
  if (/\b(bitcoin|ethereum|stablecoin)\b/.test(categoryText)) return 'asset';
  if (/\b(news|market|insight|analysis)\b/.test(categoryText)) return 'news';
  if (/\b(announcement|quickxchange update|company)\b/.test(categoryText)) return 'default';
  
  const newsScore = (t.match(/\b(news|market|update|report|analysis|price|bull|bear|trend|insight)\b/g) || []).length;
  const guidesScore = (t.match(/\b(how to|guide|tutorial|learn|what is|explain|beginner|step by step)\b/g) || []).length;
  const swapScore = (t.match(/\b(swap|convert|exchange|trade|buy|sell|pair)\b/g) || []).length;
  const securityScore = (t.match(/\b(security|safe|protect|hack|scam|wallet|keys|audit|phishing)\b/g) || []).length;
  const assetScore = (t.match(/\b(btc|bitcoin|eth|ethereum|usdt|tether|usdc)\b/g) || []).length;

  const max = Math.max(newsScore, guidesScore, swapScore, securityScore, assetScore);
  if (max === 0) return 'default';
  
  if (swapScore > 0 && assetsMentioned(t) >= 2) return 'swap';
  if (max === guidesScore) return 'guides';
  if (max === swapScore) return 'swap';
  if (max === securityScore) return 'security';
  if (max === assetScore) return 'asset';
  if (max === newsScore) return 'news';
  return 'default';
}

function assetsMentioned(value: string): number {
  return [/\b(btc|bitcoin)\b/, /\b(eth|ethereum)\b/, /\b(usdt|tether)\b/, /\busdc\b/]
    .filter((pattern) => pattern.test(value)).length;
}

export function detectAssets(title: string, category?: string, topic?: string): string[] {
  const t = `${title} ${category || ''} ${topic || ''}`.toLowerCase();
  const assets: string[] = [];
  if (t.match(/\b(btc|bitcoin)\b/)) assets.push('BTC');
  if (t.match(/\b(eth|ethereum)\b/)) assets.push('ETH');
  if (t.match(/\b(usdt|tether)\b/)) assets.push('USDT');
  if (t.match(/\b(usdc)\b/)) assets.push('USDC');
  return assets;
}

function getAssetSvg(asset: string, cx: number, cy: number, scale: number): string {
  const rx = cx - 25 * scale;
  const ry = cy - 25 * scale;
  let inner = '';
  if (asset === 'BTC') {
    inner = `<circle cx="25" cy="25" r="25" fill="#f7931a" />
<path d="M 23 12 L 23 16 M 29 12 L 29 16 M 23 34 L 23 38 M 29 34 L 29 38" stroke="#fff" stroke-width="2"/>
<path d="M 18 16 L 27 16 C 31 16 31 21 27 21 L 18 21 Z" fill="none" stroke="#fff" stroke-width="2"/>
<path d="M 18 21 L 29 21 C 33 21 33 26 29 26 L 18 26 Z" fill="none" stroke="#fff" stroke-width="2"/>`;
  } else if (asset === 'ETH') {
    inner = `<circle cx="25" cy="25" r="25" fill="#627eea" />
<path d="M 25 7 L 15 22 L 25 27 L 35 22 Z" fill="#fff" opacity="0.8"/>
<path d="M 25 7 L 25 27 L 35 22 Z" fill="#fff" opacity="0.4"/>
<path d="M 25 29 L 15 24 L 25 38 L 35 24 Z" fill="#fff" opacity="0.6"/>
<path d="M 25 29 L 25 38 L 35 24 Z" fill="#fff" opacity="0.2"/>`;
  } else if (asset === 'USDT') {
    inner = `<circle cx="25" cy="25" r="25" fill="#26a17b" />
<path d="M 15 15 L 35 15 M 25 15 L 25 35" stroke="#fff" stroke-width="4"/>
<path d="M 12 21 C 18 25 32 25 38 21" stroke="#fff" stroke-width="2" fill="none"/>`;
  } else if (asset === 'USDC') {
    inner = `<circle cx="25" cy="25" r="25" fill="#2775ca" />
<path d="M 30 15 C 25 12 18 15 18 20 C 18 25 32 25 32 30 C 32 35 25 38 20 35" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M 25 12 L 25 15 M 25 35 L 25 38" stroke="#fff" stroke-width="2"/>`;
  }
  return `<g transform="translate(${rx}, ${ry}) scale(${scale})" filter="url(#asset-shadow)">${inner}</g>`;
}

export function generateCover(options: CoverSystemOptions): CoverSystemResult {
  const prng = new PRNG(`${options.topic || ''}\u0000${options.title}\u0000${options.category || ''}`);
  
  const layout = options.layout || detectCategory(options.title, options.category, options.topic);
  const assets = detectAssets(options.title, options.category, options.topic);

  let bgMarkup = '';
  
  if (layout === 'news') {
    for(let i=0; i<16; i++) {
      const h = prng.range(50, 500);
      const x = 550 + i * 40;
      const y = 675 - h;
      const colors = ['#13ddf4', '#258cff', '#7a2cff'];
      const color = prng.choice(colors);
      const opacity = prng.range(0.1, 0.4);
      bgMarkup += `<rect x="${x}" y="${y}" width="20" height="${h}" rx="6" fill="${color}" opacity="${opacity}" filter="url(#neon-glow)"/>\n`;
    }
  } else if (layout === 'guides') {
    for(let i=0; i<12; i++) {
      const cx = prng.range(600, 1150);
      const cy = prng.range(50, 600);
      const r = prng.range(15, 60);
      const opacity = prng.range(0.1, 0.3);
      bgMarkup += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="url(#qx-neon)" stroke-width="${prng.range(2, 6)}" fill="none" opacity="${opacity}" filter="url(#neon-glow)"/>\n`;
      const cx2 = cx + prng.range(-200, 200);
      const cy2 = cy + prng.range(-200, 200);
      bgMarkup += `<line x1="${cx}" y1="${cy}" x2="${cx2}" y2="${cy2}" stroke="#7a2cff" stroke-width="2" opacity="${opacity}" />\n`;
    }
  } else if (layout === 'swap') {
    for(let i=0; i<4; i++) {
      const cx = 850 + prng.range(-150, 150);
      const cy = 337 + prng.range(-100, 100);
      const r = prng.range(100, 250);
      const w = prng.range(10, 40);
      const colors = ['#13ddf4', '#258cff', '#7a2cff'];
      const color = prng.choice(colors);
      bgMarkup += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="${w}" fill="none" opacity="0.2" filter="url(#neon-glow)"/>\n`;
    }
  } else if (layout === 'security') {
    const cx = prng.range(850, 950);
    const cy = prng.range(300, 380);
    bgMarkup += `<circle cx="${cx}" cy="${cy}" r="300" stroke="#13ddf4" stroke-width="2" stroke-dasharray="10 10" opacity="0.2" filter="url(#neon-glow)"/>\n`;
    bgMarkup += `<circle cx="${cx}" cy="${cy}" r="220" stroke="#258cff" stroke-width="4" opacity="0.2" />\n`;
    bgMarkup += `<circle cx="${cx}" cy="${cy}" r="140" stroke="#7a2cff" stroke-width="1" stroke-dasharray="5 15" opacity="0.3" filter="url(#neon-glow)"/>\n`;
    for(let i=0; i<10; i++) {
      const y = cy - 250 + i * 50;
      bgMarkup += `<line x1="${cx-250}" y1="${y}" x2="${cx+250}" y2="${y}" stroke="#258cff" stroke-width="1" opacity="0.1" />\n`;
      const x = cx - 250 + i * 50;
      bgMarkup += `<line x1="${x}" y1="${cy-250}" x2="${x}" y2="${cy+250}" stroke="#258cff" stroke-width="1" opacity="0.1" />\n`;
    }
  } else if (layout === 'asset') {
    const cx = prng.range(850, 950);
    const cy = prng.range(300, 380);
    bgMarkup += `<circle cx="${cx}" cy="${cy}" r="350" fill="#7a2cff" opacity="0.15" filter="url(#neon-glow)" />\n`;
    bgMarkup += `<circle cx="${cx}" cy="${cy}" r="200" fill="#13ddf4" opacity="0.1" filter="url(#neon-glow)" />\n`;
  } else {
    // default
    bgMarkup += `<circle cx="${prng.range(900, 1100)}" cy="${prng.range(100, 300)}" r="${prng.range(300, 500)}" fill="#7a2cff" opacity="0.15" filter="url(#neon-glow)"/>\n`;
    bgMarkup += `<circle cx="${prng.range(700, 900)}" cy="${prng.range(400, 600)}" r="${prng.range(200, 400)}" fill="#13ddf4" opacity="0.15" filter="url(#neon-glow)"/>\n`;
  }

  let assetMarkup = '';
  if (assets.length > 0) {
    if (layout === 'asset') {
      assetMarkup += getAssetSvg(assets[0], 850, 337, 5);
      if (assets.length > 1) {
        assetMarkup += getAssetSvg(assets[1], 1050, 450, 3); 
      }
    } else if (layout === 'swap' && assets.length >= 2) {
      assetMarkup += getAssetSvg(assets[0], 800, 337, 3.5);
      assetMarkup += getAssetSvg(assets[1], 1000, 337, 3.5);
      // add a small swap arrow between them
      assetMarkup += `<path d="M 880 320 L 920 320 M 910 310 L 920 320 L 910 330" stroke="#fff" stroke-width="4" fill="none" opacity="0.5"/>`;
      assetMarkup += `<path d="M 920 354 L 880 354 M 890 344 L 880 354 L 890 364" stroke="#fff" stroke-width="4" fill="none" opacity="0.5"/>`;
    } else {
      assets.forEach((asset) => {
        const ax = prng.range(800, 1100);
        const ay = prng.range(100, 500);
        assetMarkup += getAssetSvg(asset, ax, ay, 1.5 + prng.range(0, 1.5));
      });
    }
  }

  const safeCategory = xmlEscape((options.category || 'Editorial').toUpperCase());
  const categoryWidth = Math.min(360, Math.max(128, safeCategory.length * 13 + 32));
  
  const wrapped = wrapText(options.title || 'QuickXchange Editorial', 32);
  const lines = wrapped.slice(0, 4);
  if (wrapped.length > 4) {
    lines[3] = `${lines[3].slice(0, 29).trimEnd()}…`;
  }
  let textMarkup = '';
  const startY = 600 - (lines.length - 1) * 75;
  lines.forEach((line, i) => {
    textMarkup += `<text x="60" y="${startY + i * 75}" fill="#ffffff" font-size="64" font-family="system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="-1.5">${xmlEscape(line)}</text>\n`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <radialGradient id="base-glow" cx="50%" cy="0%" r="100%">
      <stop offset="0%" stop-color="#1b1236" />
      <stop offset="100%" stop-color="#05081c" />
    </radialGradient>
    <linearGradient id="qx-neon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#13ddf4" />
      <stop offset="50%" stop-color="#258cff" />
      <stop offset="100%" stop-color="#7a2cff" />
    </linearGradient>
    <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="asset-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <pattern id="dot-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#7a2cff" opacity="0.15" />
    </pattern>
  </defs>
  <rect width="1200" height="675" fill="url(#base-glow)"/>
  <rect width="1200" height="675" fill="url(#dot-grid)"/>
  
  ${bgMarkup}
  ${assetMarkup}
  
  <g transform="translate(60, 50)">
    <path d="M95.734 0H42.524c-10.62 0-20.09 6.71-23.6 16.74l-17.5 50C-4.266 82.99 7.804 100 25.024 100h61.69c.98 0 1.58-1.06 1.08-1.9l-8.28-13.75A9 9 0 0 0 71.814 80h-46.79c-3.44 0-5.86-3.4-4.72-6.65l17.5-50A5 5 0 0 1 42.524 20h53.21c3.45 0 5.86 3.4 4.72 6.65l-7.69 21.97a4.5 4.5 0 0 1-4.27 3.03h-15.2c-1.92 0-3.13 2.07-2.2 3.74l21.17 37.89c1.46 2.6 5.3 2.27 6.29-.55l18.6-53.25 2.18-6.23C125.024 17 112.964 0 95.734 0Z" fill="url(#qx-neon)" transform="scale(.48)"/>
    <text x="64" y="34" fill="#fff" font-size="28" font-family="system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="0">QuickXchange</text>
    <rect x="0" y="64" width="${categoryWidth}" height="38" rx="19" fill="#0d1738" stroke="#13ddf4" stroke-opacity=".45"/>
    <text x="18" y="90" fill="#8ff7ff" font-size="18" font-family="system-ui, -apple-system, sans-serif" font-weight="750" letter-spacing="2">${safeCategory}</text>
  </g>
  
  ${textMarkup}
</svg>`;

  return {
    svg,
    buffer: Buffer.from(svg),
    template: layout,
    detectedAssets: assets
  };
}
