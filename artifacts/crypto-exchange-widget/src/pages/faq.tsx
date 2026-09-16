import { useLayoutEffect, useState } from 'react';
import { PublicShell } from '../components/public-shell';
import { cn } from '../components/shared-app-ui';
import { Plus, Minus } from 'lucide-react';
import { Link } from 'wouter';
import './faq.css';

function SEO({ title, description }: { title: string; description: string }) {
  useLayoutEffect(() => {
    document.title = `${title} | QuickXchange`;
    const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', `${title} | QuickXchange`);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
  }, [title, description]);
  return null;
}

const FAQ_DATA = [
  {
    question: "What is QuickXchange?",
    answer: "QuickXchange is a guided crypto exchange designed to provide clear route, payment, transfer, and order information before you act."
  },
  {
    question: "What is the difference between Swap and Convert?",
    answer: "Swap uses configured QuickXchange routes and guided settlement/payment details. Convert uses supported provider conversion routes when available."
  },
  {
    question: "How long does an exchange take?",
    answer: "Estimated timing varies by the selected route and is shown in the flow."
  },
  {
    question: "How can I track my order?",
    answer: (
      <>
        Use the identifier provided after order creation on the <Link href="/status" className="text-primary hover:underline font-medium">Track an Order</Link> page. Signed-in customers can also review orders from their account.
      </>
    )
  },
  {
    question: "What information is required to place an order?",
    answer: "Required data varies and can include amount, assets/networks, contact email, payment/receiving details, destination wallet, memo/tag, refund details, and acceptance of terms."
  },
  {
    question: "How is the exchange rate calculated?",
    answer: "Rates can use live market/provider data plus configured pricing and disclosed fees. A submission consumes the displayed confirmed quote, while pre-confirmation estimates can refresh."
  },
  {
    question: "Are there minimum and maximum exchange amounts?",
    answer: "Yes. Availability, limits, and required fields vary by selected route and are shown in the flow."
  },
  {
    question: "What network should I select when sending crypto?",
    answer: "Networks must match exactly what is shown for the asset in your order details."
  },
  {
    question: "What happens if I send crypto using the wrong network?",
    answer: "Wrong-network transfers may not be recoverable. Contact QuickXchange support with your order details and TXID so the transfer can be reviewed, without assuming recovery is possible."
  },
  {
    question: "What is a transaction hash (TXID)?",
    answer: "A TXID is the blockchain transaction identifier."
  },
  {
    question: "What is a destination tag / memo?",
    answer: "A memo/tag is an additional destination identifier and is required only when the selected network says so."
  },
  {
    question: "Why can the final received amount differ from the estimate?",
    answer: "A submission consumes the displayed confirmed quote. Pre-confirmation estimates can refresh based on live data until you confirm the quote."
  },
  {
    question: "What fees may apply to an exchange?",
    answer: "Review the quote and order details for the fees applied to your selected route. QuickXchange does not assume fees that are not shown in those details."
  },
  {
    question: "Can I cancel an order after payment?",
    answer: "Cancellation is not guaranteed after payment has been sent. Check the order status and contact support immediately before taking any further action."
  },
  {
    question: "What happens if my payment is delayed?",
    answer: "Delayed payments remain subject to confirmation and should be tracked on your order status page."
  },
  {
    question: "How do refunds work?",
    answer: "Refund handling depends on the selected route, provider, and current order status. When the route requests them, valid refund wallet and memo details must be supplied. Eligibility and timing are not guaranteed."
  },
  {
    question: "How do I contact QuickXchange support?",
    answer: (
      <>
        You can reach the support team through the <Link href="/contact" className="text-primary hover:underline font-medium">Contact Us</Link> page.
      </>
    )
  }
];

function AccordionItem({ item, index, isOpen, onClick }: { item: typeof FAQ_DATA[0], index: number, isOpen: boolean, onClick: () => void }) {
  const contentId = `faq-answer-${index}`;
  return (
    <div className={cn("faq-accordion-item", isOpen && "is-open")}>
      <button
        type="button"
        className="faq-accordion-trigger"
        onClick={onClick}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <span className="faq-accordion-title">{item.question}</span>
        <span className="faq-accordion-icon" aria-hidden="true">
          <span className="relative w-5 h-5 flex items-center justify-center">
            <Plus
              size={20}
              className={cn("absolute transition-all duration-300", isOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100")}
            />
            <Minus
              size={20}
              className={cn("absolute transition-all duration-300", isOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50")}
            />
          </span>
        </span>
      </button>
      <div
        id={contentId}
        className="faq-accordion-content-wrapper"
        role="region"
        aria-label={item.question}
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="faq-accordion-content">
          <div className="faq-accordion-content-inner">
            {item.answer}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <PublicShell>
      <SEO title="FAQ - Frequently Asked Questions" description="Find quick answers about Swap, Convert, payments, crypto transfers, orders, and security." />

      <div className="relative py-24 lg:py-32 overflow-hidden flex flex-col items-center justify-center text-center px-6">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[var(--qx-gradient)] opacity-[0.08] dark:opacity-[0.15] blur-[120px] rounded-full pointer-events-none" />
        
        <div className="flex flex-col items-center faq-hero-glow">
          <span className="text-primary font-bold tracking-[0.2em] uppercase text-xs mb-6 inline-block faq-brand-glow">FAQ</span>
          <h1 className="text-4xl md:text-6xl font-marketing font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.1] mb-6 faq-title-glow">
            Frequently Asked Questions
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Find quick answers about Swap, Convert, payments, crypto transfers, orders, and security.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 lg:px-8 pb-32 faq-content-glow w-full">
        <div className="faq-accordion-root">
          {FAQ_DATA.map((item, i) => (
            <AccordionItem
              key={item.question}
              item={item}
              index={i}
              isOpen={openIndex === i}
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </PublicShell>
  );
}