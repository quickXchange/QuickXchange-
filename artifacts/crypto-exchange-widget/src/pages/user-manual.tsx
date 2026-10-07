import { sourceText } from "@workspace/i18n/runtime";
import { useI18n as useCustomerI18n } from "@workspace/i18n";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { PublicShell } from '../components/public-shell';
import { basePath, cn, SUPPORT_EMAIL } from '../components/shared-app-ui';
import { Link } from 'wouter';
import { ShieldAlert, Info, AlertTriangle, BookOpen, Maximize2, PlayCircle, RotateCcw, X, ZoomIn } from 'lucide-react';
import './user-manual.css';
import { usePublishedTelegramSupportUrl } from '../lib/telegram-support';

function useUserManualSEO() {
  useLayoutEffect(() => {
    const title = "User Manual | QuickXchange";
    const description = "Follow the QuickXchange user manual for step-by-step guidance on crypto swaps, conversions, order funding, tracking, account tools, and exchange safety.";
    const canonical = "https://quickchange.exchange/user-manual";
    const previousTitle = document.title;
    document.title = title;

    const restore: Array<() => void> = [];
    const setMeta = (
      selector: string,
      attribute: 'name' | 'property',
      key: string,
      content: string,
    ) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      const created = !meta;
      const previous = meta?.content;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
      }
      meta.content = content;
      restore.push(() => created ? meta?.remove() : meta && previous !== undefined && (meta.content = previous));
    };

    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', 'index, follow');
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'article');
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'QuickXchange');
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonicalLink;
    const previousCanonical = canonicalLink?.href;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;
    restore.push(() => canonicalCreated ? canonicalLink?.remove() : canonicalLink && previousCanonical && (canonicalLink.href = previousCanonical));

    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.dataset.clientManualJsonld = 'article';
    jsonLd.text = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          "@id": `${canonical}#article`,
          "headline": "QuickXchange User Manual",
          "description": description,
          "url": canonical,
          "inLanguage": "en",
          "image": [
            "https://quickchange.exchange/manual/swap-guide.jpg",
            "https://quickchange.exchange/manual/convert-guide.jpg",
            "https://quickchange.exchange/manual/tracking-guide.jpg"
          ],
          "publisher": {
            "@type": "Organization",
            "name": "QuickXchange",
            "url": "https://quickchange.exchange"
          }
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://quickchange.exchange"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "User Manual",
              "item": "https://quickchange.exchange/user-manual"
            }
          ]
        },
        {
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is the difference between Swap and Convert?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Swap supports configured manual routes involving cryptocurrency, fiat currencies, and available payment methods. Convert is the automated crypto-to-crypto flow."
              }
            },
            {
              "@type": "Question",
              "name": "How do I track my order?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Keep the complete tracking link supplied after submission. You can also use Track an Order with the requested Order ID and tracking information, or My Orders for eligible orders attached to your account."
              }
            },
            {
              "@type": "Question",
              "name": "How do I fund my Convert order?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Use the displayed deposit address or QR code and send the exact requested asset and amount on the exact selected network. Include a memo or tag whenever the instructions require one."
              }
            },
            {
              "@type": "Question",
              "name": "How do I fund my Swap order?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Follow the payment or deposit instructions displayed on that order. The required steps vary with the source asset and payment method selected."
              }
            }
          ]
        }
      ]
    });
    document.head.appendChild(jsonLd);
    restore.push(() => jsonLd.remove());

    return () => {
      document.title = previousTitle;
      restore.reverse().forEach(fn => fn());
    };
  }, []);
}

function Callout({ type, title, children }: { type: 'info' | 'warning' | 'safety', title: string, children: ReactNode }) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const Icon = type === 'warning' ? AlertTriangle : type === 'safety' ? ShieldAlert : Info;
  return (
    <div className={cn("user-manual-callout", type)} data-testid={`callout-${type}`}>
      <div className="user-manual-callout-title">
        <Icon size={20} aria-hidden="true" />
        <span>{uiText(title)}</span>
      </div>
      <div className="user-manual-callout-content">
        {uiText(children)}
      </div>
    </div>
  );
}

function ManualFigure({
  src,
  alt,
  title,
  caption,
  hotspots = [],
}: {
  src: string;
  alt: string;
  title: string;
  caption: string;
  hotspots?: Array<{ number: number; label: string; x: string; y: string }>;
}) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false);
    };
    document.body.classList.add('user-manual-lightbox-open');
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('user-manual-lightbox-open');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [lightboxOpen]);

  const enterFullscreen = async () => {
    if (!lightboxRef.current?.requestFullscreen) return;
    await lightboxRef.current.requestFullscreen();
  };

  return (
    <>
      <figure className="user-manual-figure">
        <button
          type="button"
          className="user-manual-figure-frame"
          onClick={() => setLightboxOpen(true)}
          aria-label={uiT("customer.m6f53bb6d75f1", { v0: title })}
        >
          <img
            src={`${basePath}${src}`}
            alt={uiText(alt)}
            loading="lazy"
            decoding="async"
            className="user-manual-figure-image"
          />
          {uiText(hotspots.map((hotspot) => (
            <span
              key={hotspot.number}
              className="user-manual-hotspot"
              style={{ left: hotspot.x, top: hotspot.y }}
              aria-label={`${hotspot.number}. ${hotspot.label}`}
            >
              {hotspot.number}
            </span>
          )))}
          <span className="user-manual-image-action" aria-hidden="true">
            <ZoomIn size={16} />
            {uiT("customer.m509c517ede79")}{' '}</span>
        </button>
        <figcaption>
          <strong>{uiText(title)}</strong>
          <span>{uiText(caption)}</span>
          {hotspots.length > 0 && (
            <ol className="user-manual-hotspot-key">
              {uiText(hotspots.map((hotspot) => <li key={hotspot.number}><b>{hotspot.number}</b>{uiText(hotspot.label)}</li>))}
            </ol>
          )}
        </figcaption>
      </figure>

      {lightboxOpen && (
        <div
          className="user-manual-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={uiT("customer.md0bf374b1a21", { v0: title })}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLightboxOpen(false);
          }}
        >
          <div className="user-manual-lightbox-panel" ref={lightboxRef}>
            <div className="user-manual-lightbox-toolbar">
              <div>
                <strong>{uiText(title)}</strong>
                <span>{uiT("customer.m834ea0165e6a")}</span>
              </div>
              <div className="user-manual-lightbox-actions">
                <button type="button" onClick={() => void enterFullscreen()} aria-label={uiT("customer.mc2a1aa73e36a")}>
                  <Maximize2 size={18} />
                  <span>{uiT("customer.mc461dbb2bab7")}</span>
                </button>
                <button type="button" onClick={() => setLightboxOpen(false)} aria-label={uiT("customer.md476f46167b7")}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="user-manual-lightbox-image-wrap">
              <img src={`${basePath}${src}`} alt={uiText(alt)} className="user-manual-lightbox-image" />
              {uiText(hotspots.map((hotspot) => (
                <span
                  key={hotspot.number}
                  className="user-manual-hotspot"
                  style={{ left: hotspot.x, top: hotspot.y }}
                  aria-label={`${hotspot.number}. ${hotspot.label}`}
                >
                  {hotspot.number}
                </span>
              )))}
            </div>
            <p>{uiText(caption)}</p>
          </div>
        </div>
      )}
    </>
  );
}

function VideoPlaceholder() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  return (
    <div
      className="user-manual-video-placeholder"
      aria-label={uiT("customer.mf68a460c80e6")}
      style={{ '--manual-video-image': `url("${basePath}/manual/convert-guide.jpg")` } as CSSProperties}
    >
      <div className="user-manual-video-screen">
        <span className="user-manual-video-icon"><PlayCircle size={34} aria-hidden="true" /></span>
        <span className="user-manual-video-eyebrow">{uiT("customer.m561d26973ca3")}</span>
        <strong>{uiT("customer.m23ef60102251")}</strong>
        <p>{uiT("customer.m76826b42f0ea")}</p>
      </div>
      <div className="user-manual-video-controls" aria-hidden="true">
        <PlayCircle size={18} />
        <div className="user-manual-video-track"><span /></div>
        <span>00:00</span>
        <RotateCcw size={17} />
        <Maximize2 size={17} />
      </div>
    </div>
  );
}

const TOC = [
  { id: 'introduction', label: sourceText("customer.m904ebfad7157") },
  { id: 'swap-vs-convert', label: sourceText("customer.m150c8ff01b96") },
  { id: 'starting-exchange', label: sourceText("customer.m188ad536c00d") },
  { id: 'selecting-assets', label: sourceText("customer.m1d674ffeac81") },
  { id: 'reviewing-quote', label: sourceText("customer.m09cff847bac0") },
  { id: 'entering-details', label: sourceText("customer.mf80f0e5e70a5") },
  { id: 'terms-submission', label: sourceText("customer.mb33f7c08d8ad") },
  { id: 'funding-order', label: sourceText("customer.m30e9cd90268d") },
  { id: 'tracking-order', label: sourceText("customer.m0f74fa441e2f") },
  { id: 'account-features', label: sourceText("customer.m78d08e0efdae") },
  { id: 'history-notifications', label: sourceText("customer.m8d442d7a4f57") },
  { id: 'affiliate-program', label: sourceText("customer.m205c73c8beac") },
  { id: 'safety-troubleshooting', label: sourceText("customer.m6f141330ff0b") },
  { id: 'common-questions', label: sourceText("customer.m76c28ab6335d") },
  { id: 'support', label: sourceText("customer.m62421bff7b47") },
];

export function UserManualPage() {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const telegramSupportUrl = usePublishedTelegramSupportUrl();
  useUserManualSEO();

  return (
    <PublicShell>
      <div className="user-manual-page">
        <div className="user-manual-hero">
          <div className="user-manual-hero-inner">
            <div className="user-manual-badge">
              <BookOpen size={16} /> {' '}{uiT("customer.m628e39a94703")}{' '}</div>
            <h1 className="user-manual-title">
              {uiT("customer.m943f7e1248b9")}{' '}</h1>
            <p className="user-manual-subtitle">
              {uiT("customer.md1d70e87f319")}{' '}</p>
          </div>
        </div>

        <div className="user-manual-container">
          <aside className="user-manual-toc" aria-label={uiT("customer.ma9360e0212a4")}>
            <h2 className="user-manual-toc-title">{uiT("customer.m437aea62a5bd")}</h2>
            <ul className="user-manual-toc-list">
              {uiText(TOC.map(item => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="user-manual-toc-link" data-testid={`link-toc-${item.id}`}>
                    {uiText(item.label)}
                  </a>
                </li>
              )))}
            </ul>
          </aside>

          <article className="user-manual-content">
            <section id="introduction">
              <h2>{uiT("customer.mb605350bc002")}</h2>
              <p>{uiT("customer.mc330f4bbe0bb")}</p>
            </section>

            <section id="swap-vs-convert">
              <h2>{uiT("customer.ma701d383dbeb")}</h2>
              <p>{uiT("customer.m44ee86e3146a")}</p>
              
              <div className="user-manual-step-grid">
                <div className="user-manual-step-card">
                  <div className="user-manual-step-number">S</div>
                  <div className="user-manual-step-content">
                    <h3>{uiT("customer.m9d3975b65685")}</h3>
                    <p>{uiT("customer.m2243507df9ed")}</p>
                  </div>
                </div>
                <div className="user-manual-step-card">
                  <div className="user-manual-step-number">C</div>
                  <div className="user-manual-step-content">
                    <h3>{uiT("customer.mc0d8d4b00d96")}</h3>
                    <p>{uiT("customer.m675b66b1464b")}</p>
                  </div>
                </div>
              </div>

              <div className="user-manual-media-grid" aria-label={uiT("customer.m54a8129ce0a7")}>
                <ManualFigure
                  src="/manual/swap-guide.jpg"
                  alt={uiT("customer.ma3f7b5b09b53")}
                  title={uiT("customer.m02c6fd5e49c9")}
                  caption="Select Swap, then choose the source and destination shown in the exchange card."
                  hotspots={[
                    { number: 1, label: uiT("customer.ma470a204bd2c"), x: '18%', y: '27%' },
                    { number: 2, label: uiT("customer.m0a16d3526042"), x: '27%', y: '56%' },
                  ]}
                />
                <ManualFigure
                  src="/manual/convert-guide.jpg"
                  alt={uiT("customer.m0ff5fe7af8aa")}
                  title={uiT("customer.mafc7207ab16b")}
                  caption="Select Convert for crypto-to-crypto orders, then choose both assets and the available rate type."
                  hotspots={[
                    { number: 1, label: uiT("customer.mc90d2eb26853"), x: '37%', y: '27%' },
                    { number: 2, label: uiT("customer.mde68d61ea23c"), x: '37%', y: '39%' },
                  ]}
                />
              </div>
            </section>

            <section id="starting-exchange">
              <h2>{uiT("customer.m75c8355455d7")}</h2>
              <p>{uiT("customer.mfc11ffaf1c3f")}{' '}<Link href="/" className="user-manual-link" data-testid="link-home">{uiT("customer.m11d58b08de98")}</Link> {' '}{uiT("customer.m1b6d37e3799f")}{' '}<Link href="/swap" className="user-manual-link" data-testid="link-swap">{uiT("customer.m6ec282d40a8a")}</Link> {' '}{uiT("customer.m7175517a370b")}{' '}<Link href="/convert" className="user-manual-link" data-testid="link-convert">{uiT("customer.m5cd425f518c2")}</Link> {' '}{uiT("customer.m2c0560d6168d")}</p>
              <ol className="user-manual-procedure">
                <li>{uiT("customer.md711512805d0")}{' '}<strong>{uiT("customer.m6ec282d40a8a")}</strong> {' '}{uiT("customer.m7175517a370b")}{' '}<strong>{uiT("customer.m5cd425f518c2")}</strong>.</li>
                <li>{uiT("customer.m3150db5e5126")}</li>
                <li>{uiT("customer.m2abb6944a14f")}</li>
              </ol>
            </section>

            <section id="selecting-assets">
              <h2>{uiT("customer.md69f3d97ec59")}</h2>
              <p>{uiT("customer.m48d9a8c6bfa9")}</p>
              <ul>
                <li><strong>{uiT("customer.md658d8e2329c")}</strong> {' '}{uiT("customer.md21defa6ec3b")}</li>
                <li><strong>{uiT("customer.m213ebafac4dc")}</strong> {' '}{uiT("customer.mb1aa08d19ca8")}</li>
              </ul>
              
              <Callout type="warning" title={uiT("customer.m8bdc18ca4ebb")}>
                <p>{uiT("customer.m283f1de904b1")}</p>
              </Callout>
            </section>

            <section id="reviewing-quote">
              <h2>{uiT("customer.md76c8d752c39")}</h2>
              <p>{uiT("customer.m7c612595c299")}</p>
              <ul>
                <li><strong>{uiT("customer.m27a9d73ba9ed")}</strong> {' '}{uiT("customer.mb55e7ec0bd9a")}</li>
                <li><strong>{uiT("customer.m9c69029091da")}</strong> {' '}{uiT("customer.m405f40c26086")}</li>
                <li><strong>{uiT("customer.mb90faacfd011")}</strong> {' '}{uiT("customer.mfdcf50188181")}</li>
              </ul>
              <p>{uiT("customer.m2f94d6fa81eb")}</p>
            </section>

            <section id="entering-details">
              <h2>{uiT("customer.m982eb43dc336")}</h2>
              <p>{uiT("customer.mb7cc3cb9370e")}</p>
              
              <h3>{uiT("customer.mfff9f1124e1c")}</h3>
              <p>{uiT("customer.mc6daedfa178c")}</p>
              
              <h3>{uiT("customer.m3a53c683989b")}</h3>
              <p>{uiT("customer.m2b2416fafeaf")}</p>
              
              <h3>{uiT("customer.m7c01aec3b1d2")}</h3>
              <p>{uiT("customer.m1660a7ffac24")}</p>

              <Callout type="safety" title={uiT("customer.md836f55a8b39")}>
                <p>{uiT("customer.mcd00d7687163")}</p>
              </Callout>
            </section>

            <section id="terms-submission">
              <h2>{uiT("customer.me65e004467f1")}</h2>
              <p>{uiT("customer.md162f0347cdf")}</p>
              <ol className="user-manual-procedure">
                <li>{uiT("customer.md430ae64d187")}</li>
                <li>{uiT("customer.mf45281a09c9d")}</li>
                <li>{uiT("customer.mdfdebefa5089")}</li>
              </ol>
            </section>

            <section id="funding-order">
              <h2>{uiT("customer.m1e5c111cf858")}</h2>
              <p>{uiT("customer.mac6e3a8eee3b")}</p>
              
              <h3>{uiT("customer.mc321a072d31a")}</h3>
              <p>{uiT("customer.m3693bb050369")}</p>
              <ol className="user-manual-procedure">
                <li>{uiT("customer.m19f732120ab0")}</li>
                <li>{uiT("customer.m5e4359e92dd1")}</li>
                <li>{uiT("customer.m2d9b430ed1d3")}</li>
                <li>{uiT("customer.mba8a4a16c05e")}{' '}<strong>{uiT("customer.m02ef7eb94bf0")}</strong> {' '}{uiT("customer.m74aa32616d17")}</li>
              </ol>

              <h3>{uiT("customer.m2b7385493526")}</h3>
              <p>{uiT("customer.mf416da3a15dc")}</p>
              <ol className="user-manual-procedure">
                <li>{uiT("customer.m922c9d55861c")}</li>
                <li>{uiT("customer.me691a53fe84a")}</li>
                <li>{uiT("customer.mf7e9591f7a90")}</li>
                <li>{uiT("customer.macfd58a3ab8d")}</li>
              </ol>

              <VideoPlaceholder />

              <Callout type="warning" title={uiT("customer.m78ffaa0ea233")}>
                <p>{uiT("customer.madfc37ef40d0")}</p>
              </Callout>
            </section>

            <section id="tracking-order">
              <h2>{uiT("customer.m2af255e37764")}</h2>
              <ManualFigure
                src="/manual/tracking-guide.jpg"
                alt={uiT("customer.maac9800a2867")}
                title={uiT("customer.m7df8946d4732")}
                caption="Open Track an Order, enter the requested Order ID and tracking information, then select Track Order."
                hotspots={[
                  { number: 1, label: uiT("customer.m1e949113bd93"), x: '43%', y: '70%' },
                  { number: 2, label: uiT("customer.mb3ea14af2d83"), x: '68%', y: '70%' },
                ]}
              />
              <p>{uiT("customer.m6024970ec5db")}</p>
              <ul>
                <li><strong>{uiT("customer.m82ada4262698")}</strong> {' '}{uiT("customer.m8470a541cb48")}</li>
                <li><strong>{uiT("customer.m31a73bc7215c")}</strong> {' '}{uiT("customer.md144e8587a69")}</li>
                <li><strong>{uiT("customer.m101c90be5c32")}</strong> {' '}{uiT("customer.mf8551a1010f3")}</li>
                <li><strong>{uiT("customer.m7e10a6053e54")}</strong> {' '}{uiT("customer.m3219cc0448d0")}</li>
              </ul>
              <p>{uiT("customer.me5973998d60d")}{' '}<Link href="/status" className="user-manual-link" data-testid="link-track">{uiT("customer.m7df8946d4732")}</Link> {' '}{uiT("customer.md1a3966583f3")}</p>
            </section>

            <section id="account-features">
              <h2>{uiT("customer.mf903ae50df21")}</h2>
              <p>{uiT("customer.mb1fd3e726d96")}</p>
              <ul>
                <li><strong>{uiT("customer.m92c906d6b2c6")}</strong> {' '}{uiT("customer.m4881d189972d")}</li>
                <li><strong>{uiT("customer.m3d30ad53ed09")}</strong> {' '}{uiT("customer.ma4dd4485ddff")}</li>
                <li><strong>{uiT("customer.m3cedb4760825")}</strong> {' '}{uiT("customer.m0c545cd7675c")}</li>
                <li><strong>{uiT("customer.m368488451ec8")}</strong> {' '}{uiT("customer.m0e56e22947d2")}</li>
              </ul>
              <p>{uiT("customer.me2645c698712")}{' '}<Link href="/account" className="user-manual-link" data-testid="link-manual-account">{uiT("customer.m7e1b0d5641f2")}</Link> {' '}{uiT("customer.mbe22ea5f398c")}</p>
            </section>

            <section id="history-notifications">
              <h2>{uiT("customer.m7501c49759d1")}</h2>
              <p>{uiT("customer.m8efa7749064b")}{' '}<Link href="/account/orders" className="user-manual-link" data-testid="link-orders">{uiT("customer.m00db793f2b8c")}</Link>{uiT("customer.m7bc03ea76f87")}</p>
              <p>{uiT("customer.m1a9810d4d843")}</p>
              <ul>
                <li>{uiT("customer.m9da2d7f35b51")}</li>
                <li>{uiT("customer.mf86a7d118c8e")}</li>
                <li>{uiT("customer.m0e478fdff38f")}</li>
              </ul>
            </section>

            <section id="affiliate-program">
              <h2>{uiT("customer.m53602f507355")}</h2>
              <p>{uiT("customer.m73b384d78493")}</p>
              <ol>
                <li>{uiT("customer.mfcf138aa8809")}</li>
                <li>{uiT("customer.md9f482a2ab9c")}</li>
                <li>{uiT("customer.m80ca1b6fd545")}</li>
                <li>{uiT("customer.mc0957e5d2a96")}</li>
              </ol>
              <p>{uiT("customer.me1c1af9e7048")}</p>
            </section>

            <section id="safety-troubleshooting">
              <h2>{uiT("customer.m6e8c968518d8")}</h2>
              <p>{uiT("customer.m610e5d4ae726")}</p>
              
              <div className="user-manual-table-container">
                <table className="user-manual-table">
                  <thead>
                    <tr>
                      <th>{uiT("customer.m2fcb5d374697")}</th>
                      <th>{uiT("customer.m376e8588b98f")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{uiT("customer.m626942a90e91")}</td>
                      <td>{uiT("customer.m25242d1cd0d5")}</td>
                    </tr>
                    <tr>
                      <td>{uiT("customer.ma10141dacd87")}</td>
                      <td>{uiT("customer.maebfbe1b322f")}</td>
                    </tr>
                    <tr>
                      <td>{uiT("customer.m55afb6b2b5cb")}</td>
                      <td>{uiT("customer.m4bcbf41c67fa")}</td>
                    </tr>
                    <tr>
                      <td>{uiT("customer.m18f9d2370731")}</td>
                      <td>{uiT("customer.mfb62a4a8aa70")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section id="common-questions">
              <h2>{uiT("customer.mdfbe4d437b59")}</h2>
              <h3>{uiT("customer.m6dc32da5f42b")}</h3>
              <p>{uiT("customer.m4ebcc5ab4a0f")}</p>
              <h3>{uiT("customer.m13403393421c")}</h3>
              <p>{uiT("customer.m2576660a997a")}</p>
              <h3>{uiT("customer.m56dd57193fc7")}</h3>
              <p>{uiT("customer.m9bbc182a8c1b")}</p>
              <h3>{uiT("customer.mc96ac49dc4ad")}</h3>
              <p>{uiT("customer.mb0308bb998af")}</p>
            </section>

            <section id="support">
              <h2>{uiT("customer.mbe91940b79f4")}</h2>
              <p>{uiT("customer.m58d6abfe3480")}</p>
              <ul>
                <li><strong>{uiT("customer.mbeee701cf8a9")}</strong> <a href={telegramSupportUrl} aria-disabled={!telegramSupportUrl} tabIndex={telegramSupportUrl ? undefined : -1} target="_blank" rel="noopener noreferrer" className="user-manual-link" data-testid="link-manual-telegram">{uiT("customer.ma30e1e636895")}</a></li>
                <li><strong>{uiT("customer.m66d3afadbe3b")}</strong> <a href={`mailto:${SUPPORT_EMAIL}`} className="user-manual-link" data-testid="link-manual-email">{SUPPORT_EMAIL}</a></li>
              </ul>
              <p>{uiT("customer.m45df89881ccc")}</p>
            </section>
          </article>
        </div>
      </div>
    </PublicShell>
  );
}
