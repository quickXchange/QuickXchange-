import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { PublicShell } from '../components/public-shell';
import { basePath, cn, SUPPORT_TELEGRAM, SUPPORT_EMAIL } from '../components/shared-app-ui';
import { Link } from 'wouter';
import { ShieldAlert, Info, AlertTriangle, BookOpen } from 'lucide-react';
import './user-manual.css';

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
  const Icon = type === 'warning' ? AlertTriangle : type === 'safety' ? ShieldAlert : Info;
  return (
    <div className={cn("user-manual-callout", type)} data-testid={`callout-${type}`}>
      <div className="user-manual-callout-title">
        <Icon size={20} aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div className="user-manual-callout-content">
        {children}
      </div>
    </div>
  );
}

function ManualFigure({
  src,
  alt,
  title,
  caption,
}: {
  src: string;
  alt: string;
  title: string;
  caption: string;
}) {
  return (
    <figure className="user-manual-figure">
      <div className="user-manual-figure-frame">
        <img
          src={`${basePath}${src}`}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="user-manual-figure-image"
        />
      </div>
      <figcaption>
        <strong>{title}</strong>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

const TOC = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'swap-vs-convert', label: 'Swap vs. Convert' },
  { id: 'starting-exchange', label: 'Starting an Exchange' },
  { id: 'selecting-assets', label: 'Selecting Assets & Networks' },
  { id: 'reviewing-quote', label: 'Reviewing Your Quote' },
  { id: 'entering-details', label: 'Entering Details' },
  { id: 'terms-submission', label: 'Terms & Submission' },
  { id: 'funding-order', label: 'Funding Your Order' },
  { id: 'tracking-order', label: 'Tracking Your Order' },
  { id: 'account-features', label: 'Account Features' },
  { id: 'history-notifications', label: 'History & Notifications' },
  { id: 'affiliate-program', label: 'Affiliate Program' },
  { id: 'safety-troubleshooting', label: 'Safety & Troubleshooting' },
  { id: 'common-questions', label: 'Common Questions' },
  { id: 'support', label: 'Support' },
];

export function UserManualPage() {
  useUserManualSEO();

  return (
    <PublicShell>
      <div className="user-manual-page">
        <div className="user-manual-hero">
          <div className="user-manual-hero-inner">
            <div className="user-manual-badge">
              <BookOpen size={16} /> Official Documentation
            </div>
            <h1 className="user-manual-title">
              User Manual
            </h1>
            <p className="user-manual-subtitle">
              Follow clear, step-by-step guidance for choosing an exchange mode, creating and funding an order, tracking progress, using your account, and staying safe.
            </p>
          </div>
        </div>

        <div className="user-manual-container">
          <aside className="user-manual-toc" aria-label="Table of Contents">
            <h2 className="user-manual-toc-title">Contents</h2>
            <ul className="user-manual-toc-list">
              {TOC.map(item => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="user-manual-toc-link" data-testid={`link-toc-${item.id}`}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          <article className="user-manual-content">
            <section id="introduction">
              <h2>Introduction</h2>
              <p>Welcome to the QuickXchange User Manual. This guide provides step-by-step instructions for navigating the exchange platform. Whether you are using a supported manual Swap route or an automated crypto-to-crypto Convert route, use this document to understand each stage before submitting funds.</p>
            </section>

            <section id="swap-vs-convert">
              <h2>Choosing Between Swap and Convert</h2>
              <p>QuickXchange offers two distinct exchange journeys tailored to your needs. Selecting the right one ensures a smooth transaction.</p>
              
              <div className="user-manual-step-grid">
                <div className="user-manual-step-card">
                  <div className="user-manual-step-number">S</div>
                  <div className="user-manual-step-content">
                    <h3>Swap (Manual Orders)</h3>
                    <p>Use Swap for supported routes involving cryptocurrency, fiat currencies, and available payment methods. The instructions and confirmation process depend on the source you select, so follow the exact details displayed on your order.</p>
                  </div>
                </div>
                <div className="user-manual-step-card">
                  <div className="user-manual-step-number">C</div>
                  <div className="user-manual-step-content">
                    <h3>Convert (Automated)</h3>
                    <p>Built exclusively for crypto-to-crypto exchanges. Convert generates an automated deposit address and QR code, monitoring the blockchain to process your transaction as soon as the funds arrive.</p>
                  </div>
                </div>
              </div>

              <div className="user-manual-media-grid" aria-label="Swap and Convert interface examples">
                <ManualFigure
                  src="/manual/swap-guide.jpg"
                  alt="QuickXchange Swap screen showing the You Send and You Receive selectors"
                  title="Swap interface"
                  caption="Select Swap, then choose the source and destination shown in the exchange card."
                />
                <ManualFigure
                  src="/manual/convert-guide.jpg"
                  alt="QuickXchange Convert screen showing crypto selectors and floating-rate choice"
                  title="Convert interface"
                  caption="Select Convert for crypto-to-crypto orders, then choose both assets and the available rate type."
                />
              </div>
            </section>

            <section id="starting-exchange">
              <h2>Starting an Exchange</h2>
              <p>To begin, navigate to the main exchange widget on the <Link href="/" className="user-manual-link" data-testid="link-home">Home page</Link> or open the dedicated <Link href="/swap" className="user-manual-link" data-testid="link-swap">Swap</Link> or <Link href="/convert" className="user-manual-link" data-testid="link-convert">Convert</Link> page.</p>
              <ol>
                <li>Select the appropriate tab: <strong>Swap</strong> or <strong>Convert</strong>.</li>
                <li>Choose whether you are sending ("You Send") or receiving ("You Receive") a specific amount by interacting with the input fields.</li>
                <li>Click on the asset dropdowns to open the selection menu.</li>
              </ol>
            </section>

            <section id="selecting-assets">
              <h2>Selecting Assets, Networks, and Payment Methods</h2>
              <p>Accurate selection of your assets and their corresponding networks is a critical step in the exchange process.</p>
              <ul>
                <li><strong>Cryptocurrencies:</strong> Search for the token you wish to exchange. Pay close attention to the network badge displayed next to the token name.</li>
                <li><strong>Fiat / Payment Methods:</strong> If you are using the Swap flow, select the relevant payment method (e.g., bank transfer, specific e-wallet) available for your region.</li>
              </ul>
              
              <Callout type="warning" title="Network Verification">
                <p>Always verify that the selected network matches the network you intend to use in your wallet. A mismatched network can make funds difficult or impossible to recover.</p>
              </Callout>
            </section>

            <section id="reviewing-quote">
              <h2>Reviewing Your Quote</h2>
              <p>Once you enter an amount, the system automatically calculates the exchange rate and available quote.</p>
              <ul>
                <li><strong>Exchange Rate:</strong> The current market rate applied to your transaction.</li>
                <li><strong>Minimum and Maximum Limits:</strong> The platform will indicate if your requested amount falls below the minimum requirement or exceeds the maximum limit for the chosen route.</li>
                <li><strong>Displayed fees and totals:</strong> Review every amount and fee shown for the selected route before continuing.</li>
              </ul>
              <p>Review these details carefully. Submit only while the displayed quote is valid; if it expires or the route changes, request and review a refreshed quote.</p>
            </section>

            <section id="entering-details">
              <h2>Entering Details (Receiving, Refund, Contact)</h2>
              <p>Before proceeding to the order confirmation, you must provide accurate destination and fallback information.</p>
              
              <h3>Destination Address</h3>
              <p>Enter the exact address where you wish to receive your funds. If the blockchain network requires a Memo, Tag, or Payment ID (common with XRP, XLM, and others), ensure it is included in the designated field.</p>
              
              <h3>Refund Address</h3>
              <p>If the form offers a refund-address field, you may provide an address on the source network. Verify its network and any required memo or tag before continuing.</p>
              
              <h3>Contact Information</h3>
              <p>Guests must provide a valid email address. Signed-in customers should verify that their account email is current so available order notifications and support communications can reach them.</p>

              <Callout type="safety" title="Address Accuracy Check">
                <p>Take an extra moment to double-check the destination and refund addresses. Blockchain transactions are irreversible. QuickXchange cannot recover funds sent to incorrect addresses.</p>
              </Callout>
            </section>

            <section id="terms-submission">
              <h2>Terms and Order Submission</h2>
              <p>To finalize the creation of your order, you must review and agree to the platform's terms of service and privacy policy.</p>
              <ol>
                <li>Check the agreement box to confirm your acceptance.</li>
                <li>Use the final submit button shown for the selected flow.</li>
                <li>You will be securely routed to your unique Order Details page. Bookmark this page or save your Order ID.</li>
              </ol>
            </section>

            <section id="funding-order">
              <h2>Funding Your Order</h2>
              <p>The method for funding your order depends on whether you chose Swap or Convert.</p>
              
              <h3>For Swap Orders</h3>
              <p>Your order page displays instructions for the source asset or payment method you selected.</p>
              <ol>
                <li>Open and read all payment or deposit instructions.</li>
                <li>Confirm the asset, network, recipient details, exact amount, and any payment reference.</li>
                <li>Send funds through the instructed wallet, bank, or payment provider.</li>
                <li>If the order page offers an <strong>I've Paid</strong> action for that payment route, use it only after sending the payment. This reports your payment; it does not confirm settlement.</li>
              </ol>

              <h3>For Convert Orders</h3>
              <p>You will be provided with a deposit address and a QR code.</p>
              <ol>
                <li>Open your cryptocurrency wallet.</li>
                <li>Scan the QR code or copy the deposit address carefully.</li>
                <li>Send the exact specified amount of crypto on the correct network.</li>
                <li>The system will automatically detect the incoming deposit once it is confirmed on the blockchain.</li>
              </ol>

              <Callout type="warning" title="Exact Amount Requirement">
                <p>Always send the exact amount requested. Sending a different amount may delay processing or require manual intervention by our support team.</p>
              </Callout>
            </section>

            <section id="tracking-order">
              <h2>Tracking Your Order</h2>
              <ManualFigure
                src="/manual/tracking-guide.jpg"
                alt="QuickXchange Track your order page with an Order ID field and Track Order button"
                title="Track an Order"
                caption="Open Track an Order, enter the requested Order ID and tracking information, then select Track Order."
              />
              <p>Every exchange generates a unique Order ID and an order or tracking page. Status availability depends on the order type and tracking information supplied when the order was created.</p>
              <ul>
                <li><strong>Pending:</strong> The order is created and awaiting your deposit.</li>
                <li><strong>Deposit Received:</strong> Your funds have arrived and are being verified.</li>
                <li><strong>Processing:</strong> The exchange is being executed.</li>
                <li><strong>Completed:</strong> The funds have been sent to your destination address.</li>
              </ul>
              <p>Keep the complete tracking link shown after submission. To look up an order later, open <Link href="/status" className="user-manual-link" data-testid="link-track">Track an Order</Link> and provide the requested Order ID and tracking information. Signed-in customers can also open eligible attached orders from their account.</p>
            </section>

            <section id="account-features">
              <h2>Account Features</h2>
              <p>You can begin an exchange as a guest. A customer account provides access to account-specific tools for eligible orders.</p>
              <ul>
                <li><strong>Order directory:</strong> View orders attached to your signed-in customer account.</li>
                <li><strong>Order details:</strong> Open an attached order to review customer-safe details and available actions.</li>
                <li><strong>Notification settings:</strong> Manage available order-notification preferences.</li>
                <li><strong>Affiliate dashboard:</strong> Access referral and commission tools when your account is eligible.</li>
              </ul>
              <p>To register or sign in, open <Link href="/account" className="user-manual-link" data-testid="link-manual-account">Account</Link> from the main navigation.</p>
            </section>

            <section id="history-notifications">
              <h2>Order History and Notifications</h2>
              <p>If you are signed in, you can view orders attached to your account under <Link href="/account/orders" className="user-manual-link" data-testid="link-orders">My Orders</Link>. Guest orders are not automatically a complete account history; follow the claim or attachment options shown for an eligible order.</p>
              <p>When notifications are enabled and available for the order, email updates may be sent for milestones such as:</p>
              <ul>
                <li>Order Creation (includes your Order ID and tracking link)</li>
                <li>Deposit Confirmation</li>
                <li>Successful Completion</li>
              </ul>
            </section>

            <section id="affiliate-program">
              <h2>Affiliate Program</h2>
              <p>QuickXchange provides an affiliate program for users who wish to invite others to the platform.</p>
              <ol>
                <li>Sign in to your account.</li>
                <li>Navigate to the Affiliate section to generate your unique referral link.</li>
                <li>Share this link with your network.</li>
                <li>Track your referrals, volume, and accumulated balances within your dashboard.</li>
              </ol>
              <p>Check the program guidelines in your dashboard for details on payout structures and terms.</p>
            </section>

            <section id="safety-troubleshooting">
              <h2>Safety and Troubleshooting</h2>
              <p>Security is a shared responsibility. Please adhere to these best practices when using the platform.</p>
              
              <div className="user-manual-table-container">
                <table className="user-manual-table">
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th>Recommended Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Address Validation</td>
                      <td>Always copy and paste addresses. Do not type them manually. Check the first and last four characters before confirming.</td>
                    </tr>
                    <tr>
                      <td>Missing Memos/Tags</td>
                      <td>If you forgot to include a required Memo/Tag, the funds may be unrecoverable. Contact support immediately with your transaction hash.</td>
                    </tr>
                    <tr>
                      <td>Order Expired</td>
                      <td>If you did not send funds in time, the order will expire. Create a new order to receive a current exchange rate. Do not send funds to an expired order address.</td>
                    </tr>
                    <tr>
                      <td>Delayed Status</td>
                      <td>Blockchain congestion can delay deposits. Wait for standard network confirmations before assuming an issue has occurred.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section id="common-questions">
              <h2>Common Questions</h2>
              <h3>What is the difference between Swap and Convert?</h3>
              <p>Swap supports configured manual routes involving cryptocurrency, fiat currencies, and available payment methods. Convert is the automated crypto-to-crypto flow.</p>
              <h3>How do I track my order?</h3>
              <p>Keep the complete tracking link supplied after submission. You can also open the Track an Order page and enter the requested Order ID and tracking information, or use My Orders for eligible orders attached to your account.</p>
              <h3>How do I fund a Convert order?</h3>
              <p>Use the displayed deposit address or QR code and send the exact requested asset and amount on the exact selected network. Include a memo or tag whenever the instructions require one.</p>
              <h3>How do I fund a Swap order?</h3>
              <p>Follow the payment or deposit instructions displayed on that order. The required steps vary with the source asset and payment method you selected.</p>
            </section>

            <section id="support">
              <h2>Support</h2>
              <p>If you encounter an issue not covered in this manual, our support team is available to assist you. Please have your Order ID and relevant transaction hashes ready before reaching out.</p>
              <ul>
                <li><strong>Telegram Support:</strong> <a href={SUPPORT_TELEGRAM} target="_blank" rel="noopener noreferrer" className="user-manual-link" data-testid="link-manual-telegram">Open Telegram Chat</a></li>
                <li><strong>Email Support:</strong> <a href={`mailto:${SUPPORT_EMAIL}`} className="user-manual-link" data-testid="link-manual-email">{SUPPORT_EMAIL}</a></li>
              </ul>
              <p>Our representatives will never ask for your private keys, seed phrases, or passwords. Stay vigilant and ensure you are only communicating through our official channels.</p>
            </section>
          </article>
        </div>
      </div>
    </PublicShell>
  );
}
