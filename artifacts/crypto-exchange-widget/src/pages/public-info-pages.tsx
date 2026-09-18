import { useLayoutEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PublicShell } from '../components/public-shell';
import { basePath, cn, InlineNotice, SUPPORT_TELEGRAM, SUPPORT_EMAIL } from '../components/shared-app-ui';
import { useCreateContactSubmission, useGetPublishedSiteContent, getGetPublishedSiteContentQueryKey, useSubscribeNewsletter } from '@workspace/api-client-react';
import NotFound from './not-found';
import { Loader2, ShieldCheck, Search, BookOpen, HelpCircle, ArrowRight, Mail } from 'lucide-react';
import { SiTelegram } from 'react-icons/si';
import { Link } from 'wouter';
import { contentValue } from './site-content';
import { useSitePreview } from '../components/site-preview-context';
import { PRIVACY_NOTICE_SECTIONS, TERMS_NOTICE_SECTIONS } from '../lib/legal-page-content';

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

function HeroSection({ title, subtitle, imagePath, imageAlt, aboutGlow = false, contactGlow = false, affiliateGlow = false, privacyGlow = false, termsGlow = false, amlGlow = false }: { title: string; subtitle: string; imagePath?: string; imageAlt?: string; aboutGlow?: boolean; contactGlow?: boolean; affiliateGlow?: boolean; privacyGlow?: boolean; termsGlow?: boolean; amlGlow?: boolean }) {
  const preview = useSitePreview();
  const imageUrl = imagePath
    ? preview.assetUrls?.[imagePath]
      ?? (preview.active && preview.pageKey
        ? `${basePath}/api/admin/site-page-media/${preview.pageKey}/${imagePath.split('/').pop()}/preview`
        : `${basePath}/api/storage/objects/site-page-media/${imagePath.split('/').pop()}`)
    : '';
  return (
    <div className={cn("relative py-24 lg:py-32 overflow-hidden flex flex-col items-center justify-center text-center px-3 sm:px-6", imagePath ? "lg:flex-row lg:text-left lg:justify-between max-w-6xl mx-auto gap-12" : "", aboutGlow && "about-hero-glow", contactGlow && "contact-hero-glow", affiliateGlow && "affiliate-hero-glow", privacyGlow && "privacy-hero-glow", termsGlow && "terms-hero-glow", amlGlow && "aml-hero-glow")}>
      {!imagePath && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[var(--qx-gradient)] opacity-[0.08] dark:opacity-[0.15] blur-[120px] rounded-full pointer-events-none" />}
      <div className={cn("flex flex-col items-center", imagePath ? "lg:items-start lg:w-1/2" : "")}>
        <span className={cn("text-primary font-bold tracking-[0.2em] uppercase text-xs mb-6 inline-block", aboutGlow && "about-brand-glow", contactGlow && "contact-brand-glow", affiliateGlow && "affiliate-brand-glow", privacyGlow && "privacy-brand-glow", termsGlow && "terms-brand-glow", amlGlow && "aml-brand-glow")}>QuickXchange</span>
        <h1 className={cn("text-4xl md:text-6xl lg:text-7xl font-marketing font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.1] mb-6", aboutGlow && "about-title-glow", contactGlow && "contact-title-glow", affiliateGlow && "affiliate-title-glow", privacyGlow && "privacy-title-glow", termsGlow && "terms-title-glow", amlGlow && "aml-title-glow")}>
          {title}
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      </div>
      {imagePath && (
        <div className="w-full lg:w-1/2 mt-12 lg:mt-0">
          <div className="relative aspect-square md:aspect-[4/3] w-full overflow-hidden rounded-3xl border border-border bg-card/50 shadow-sm">
             <img src={imageUrl} alt={imageAlt || title} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </div>
      )}
    </div>
  );
}

function ContentCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-card/50 backdrop-blur-sm border border-border rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden", className)}>
      <div className="absolute top-0 left-0 w-full h-1 bg-[var(--qx-gradient)] opacity-70" />
      <h2 className="text-2xl font-marketing font-bold text-foreground mb-6">{title}</h2>
      <div className="space-y-6 text-muted-foreground leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 pb-32 space-y-12", className)}>
      {children}
    </div>
  );
}

function ManagedContent({
  content,
  children,
  preserveChildren = false,
}: {
  content?: Record<string, unknown>;
  children: React.ReactNode;
  preserveChildren?: boolean;
}) {
  const sections = Array.isArray(content?.sections)
    ? content.sections.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const section = value as Record<string, unknown>;
      const body = contentValue(section, ['body', 'description', 'text']);
      return body ? [{ heading: contentValue(section, ['heading', 'title'], 'Section'), body }] : [];
    })
    : [];
  const body = contentValue(content, ['body', 'content']);
  const primary = content?.primaryButton && typeof content.primaryButton === 'object'
    ? content.primaryButton as Record<string, unknown>
    : {};
  const secondary = content?.secondaryButton && typeof content.secondaryButton === 'object'
    ? content.secondaryButton as Record<string, unknown>
    : {};
  const hasManagedCopy = sections.length > 0 || Boolean(body);
  return <>
    {hasManagedCopy ? (
      <>
        {body && <ContentCard title={contentValue(content, ['bodyHeading'], 'Overview')}><p className="whitespace-pre-wrap">{body}</p></ContentCard>}
        {sections.map((section, index) => <ContentCard key={`${section.heading}-${index}`} title={section.heading}><p className="whitespace-pre-wrap">{section.body}</p></ContentCard>)}
      </>
    ) : children}
    {preserveChildren && hasManagedCopy ? children : null}
    {(typeof primary.label === 'string' && typeof primary.href === 'string') || (typeof secondary.label === 'string' && typeof secondary.href === 'string') ? (
      <div className="flex flex-wrap gap-3">
        {typeof primary.label === 'string' && typeof primary.href === 'string' && <a className="button button-primary" href={primary.href} data-testid="link-page-primary-action">{primary.label}</a>}
        {typeof secondary.label === 'string' && typeof secondary.href === 'string' && <a className="button button-secondary" href={secondary.href} data-testid="link-page-secondary-action">{secondary.label}</a>}
      </div>
    ) : null}
  </>;
}

// 1. About
export function AboutPage() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });

  const content = preview.active && preview.pageKey === 'about-us'
    ? preview.content
    : published.data?.pages?.find(p => p.pageKey === 'about-us')?.content;

  if ((content?.visibility as any)?.enabled === false) return <NotFound />;

  const title = contentValue(content, ['title', 'headline', 'heading'], "About Us");
  const subtitle = contentValue(content, ['subtitle', 'intro', 'description', 'body'], "We are redefining the exchange experience with transparency, speed, and premium support.");
  const heroImagePath = (content?.heroImage as any)?.objectPath;
  const heroImageAlt = (content?.heroImage as any)?.altText;
  const seoTitle = (content?.seo as any)?.title || "About Us";
  const seoDesc = (content?.seo as any)?.description || "We are redefining the exchange experience with transparency, speed, and premium support.";
  const differenceTitle = contentValue(content, ['differenceTitle'], "What makes QuickXchange different?");
  const configuredPoints = Array.isArray(content?.differencePoints) ? content.differencePoints : [];
  const defaultPoints = [
    {
      title: "Transfer with confidence",
      description: "We understand the importance of executing transactions safely and efficiently. That's why we operate around-the-clock, utilizing a global network of banks and e-wallets to ensure our customers receive the best service possible. Trust us to handle your transactions with speed and security.",
    },
    {
      title: "Effortless Money Transfers",
      description: "With our platform, sending and receiving money has never been easier. Our user-friendly interface enables you to complete transactions with just a few clicks. Plus, our dedicated support team is available round-the-clock to provide prompt assistance with any inquiries or concerns you may have. Choose us for hassle-free money transfers!",
    },
    {
      title: "Experience the Difference",
      description: "At our company, we strive to offer a wide range of services to our customers while providing exceptional customer service. Our top priorities are security and performance, while also ensuring that our platform is user-friendly and convenient. With our team's creative ideas and dedication, we aim to make a significant impact in the global market.",
    },
    {
      title: "Time is Money",
      description: "We know that in today's fast-paced world, time is of the essence. That's why we promise to provide our customers with swift, secure, and straightforward financial services, ensuring that their needs always come first. Our team is dedicated to delivering the best possible experience, and we're always working to improve our services so that you can enjoy even greater convenience.",
    },
  ];
  const differencePoints = defaultPoints.map((fallback, index) => {
    const configured = configuredPoints[index];
    if (!configured || typeof configured !== 'object') return fallback;
    const point = configured as Record<string, unknown>;
    return {
      title: contentValue(point, ['title', 'heading'], fallback.title),
      description: contentValue(point, ['description', 'body', 'text'], fallback.description),
    };
  });
return (
    <PublicShell>
      <SEO title={seoTitle} description={seoDesc} />
      <HeroSection title={title} subtitle={subtitle} imagePath={heroImagePath} imageAlt={heroImageAlt} aboutGlow />
      <PageContainer className="about-content-glow">
         <section aria-labelledby="about-difference-title">
           <h2 id="about-difference-title" className="mb-8 text-center text-3xl font-marketing font-extrabold text-foreground md:text-4xl" data-testid="text-about-difference-title">{differenceTitle}</h2>
           <ol className="grid gap-6 md:grid-cols-2">
             {differencePoints.map((point, index) => (
               <li className="about-value-card bg-card border border-border rounded-3xl p-8 shadow-sm" key={index} data-testid={`card-about-point-${index + 1}`}>
                 <span className="about-heading-glow block text-4xl font-marketing font-extrabold text-primary mb-5" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                 <h3 className="about-heading-glow text-xl font-bold text-foreground mb-3">{point.title}</h3>
                 <p className="text-sm leading-relaxed text-muted-foreground">{point.description}</p>
               </li>
             ))}
           </ol>
         </section>
      </PageContainer>
    </PublicShell>
  );
}

// 2. Affiliates
export function AffiliatesPage() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });

  const content = preview.active && preview.pageKey === 'affiliate-program'
    ? preview.content
    : published.data?.pages?.find(p => p.pageKey === 'affiliate-program')?.content;

  if ((content?.visibility as any)?.enabled === false) return <NotFound />;

  const title = contentValue(content, ['title', 'headline', 'heading'], "Partner with excellence.");
  const subtitle = contentValue(content, ['subtitle', 'intro', 'description', 'body'], "Introduce customers to a clearer exchange experience and manage your referrals from one dedicated account area.");
  const heroImagePath = (content?.heroImage as any)?.objectPath;
  const heroImageAlt = (content?.heroImage as any)?.altText;
  const seoTitle = (content?.seo as any)?.title || "Partner with excellence.";
  const seoDesc = (content?.seo as any)?.description || "Introduce customers to a clearer exchange experience and manage your referrals from one dedicated account area.";
  const howItWorksTitle = contentValue(content, ['howItWorksTitle'], "How Does It Work?");
  const configuredSteps = Array.isArray(content?.howItWorksSteps) ? content.howItWorksSteps : [];
  const defaultSteps = [
    {
      title: "Ask people to Join",
      description: "Promote your affiliate link or code through social media, friends, communities, and groups. You can find your unique link or code in your affiliate dashboard.",
    },
    {
      title: "Engage to Exchange",
      description: "Promote QuickXchange among your affiliates and teach them how to exchange between payment methods. Earn 30% of fees from their orders.",
    },
    {
      title: "Earn revenue",
      description: "Monitor your affiliates’ activity through your affiliate dashboard and watch your profits increase automatically. You can withdraw profits to your wallet once your profits reach 30$ or more.",
    },
  ];
  const howItWorksSteps = defaultSteps.map((fallback, index) => {
    const configured = configuredSteps[index];
    if (!configured || typeof configured !== 'object') return fallback;
    const step = configured as Record<string, unknown>;
    return {
      title: contentValue(step, ['title', 'heading'], fallback.title),
      description: contentValue(step, ['description', 'body', 'text'], fallback.description),
    };
  });

  return (
    <PublicShell>
      <SEO title={seoTitle} description={seoDesc} />
      <HeroSection title={title} subtitle={subtitle} imagePath={heroImagePath} imageAlt={heroImageAlt} affiliateGlow />
      <PageContainer className="affiliate-content-glow">
         <section aria-labelledby="affiliate-how-it-works-title">
           <h2 id="affiliate-how-it-works-title" className="mb-8 text-center text-3xl font-marketing font-extrabold text-foreground md:text-4xl" data-testid="text-affiliate-how-it-works-title">{howItWorksTitle}</h2>
           <ol className="grid gap-6 md:grid-cols-3">
             {howItWorksSteps.map((step, index) => (
               <li className="affiliate-feature-card bg-card border border-border rounded-3xl p-8 shadow-sm" key={index} data-testid={`card-affiliate-step-${index + 1}`}>
                 <span className="affiliate-feature-word block text-4xl font-marketing font-extrabold text-primary mb-5" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                 <h3 className="affiliate-heading-glow text-lg font-bold text-foreground mb-3">{step.title}</h3>
                 <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
               </li>
             ))}
           </ol>
         </section>
      </PageContainer>
    </PublicShell>
  );
}

// 3. Contact Us
export function ContactUsPage() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });

  const content = preview.active && preview.pageKey === 'contact-us'
    ? preview.content
    : published.data?.pages?.find(p => p.pageKey === 'contact-us')?.content;

  if ((content?.visibility as any)?.enabled === false) return <NotFound />;

  const seoTitle = (content?.seo as any)?.title || "Contact Us";
  const seoDesc = (content?.seo as any)?.description || "For feedback, questions, or in case of issues, use the form or contact our support team.";

  const submit = useCreateContactSubmission();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterNotice, setNewsletterNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const newsletterSubmit = useSubscribeNewsletter();

  const valid = form.name.trim().length >= 1 && form.name.trim().length <= 120 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.email.length <= 320 &&
    form.message.trim().length >= 1 && form.message.length <= 5000;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!valid) { setNotice({ kind: 'error', text: 'Please enter a valid name, email address, and message.' }); return; }
    submit.mutate({ data: { name: form.name.trim(), email: form.email.trim(), message: form.message.trim() } }, {
      onSuccess: () => { setForm({ name: '', email: '', message: '' }); setNotice({ kind: 'success', text: 'Message sent successfully. Our support team will get back to you soon.' }); },
      onError: () => setNotice({ kind: 'error', text: 'Your message could not be sent. Please try again later.' }),
    });
  };

  const onNewsletterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewsletterNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newsletterEmail)) {
      setNewsletterNotice({ kind: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    newsletterSubmit.mutate({ data: { email: newsletterEmail.trim().toLowerCase() } }, {
      onSuccess: () => {
        setNewsletterEmail('');
        setNewsletterNotice({ kind: 'success', text: 'Thanks — you’re subscribed to QuickXchange updates.' });
      },
      onError: () => setNewsletterNotice({ kind: 'error', text: 'We could not subscribe you right now. Please try again later.' }),
    });
  };

  return (
    <PublicShell>
      <SEO title={seoTitle} description={seoDesc} />
      <ManagedContent content={content} preserveChildren>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-16 lg:py-24 space-y-24">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
            {/* Left Column: Heading, Cards, Social */}
            <div className="flex flex-col gap-12">
              <div>
                <h1 className="text-4xl md:text-5xl font-marketing font-extrabold tracking-tight text-foreground mb-4">Contact Us</h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  For feedback, questions, or in case of issues, use the form or contact our support team.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <Link href="/status" className="contact-redesign-card contact-resource-link" data-testid="link-contact-track-order">
                  <div className="contact-redesign-icon">
                    <Search size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-foreground mb-1">Check your swap status</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Track your order in real-time.</p>
                  </div>
                  <ArrowRight size={18} className="contact-resource-arrow" />
                </Link>

                <Link href="/how-it-works" className="contact-redesign-card contact-resource-link" data-testid="link-contact-how-it-works">
                  <div className="contact-redesign-icon">
                    <BookOpen size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-foreground mb-1">How to use our service</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Simple step-by-step guides.</p>
                  </div>
                  <ArrowRight size={18} className="contact-resource-arrow" />
                </Link>

                <div className="contact-redesign-card" aria-disabled="true">
                  <div className="contact-redesign-icon">
                    <HelpCircle size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-foreground mb-1">Frequently asked questions</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Find answers to common questions.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
                <a
                  href={SUPPORT_TELEGRAM}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex min-h-11 items-center gap-3 text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                  aria-label="Contact QuickXchange support on Telegram"
                  data-testid="link-contact-telegram"
                >
                  <SiTelegram
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 text-[#229ED9] transition duration-200 group-hover:drop-shadow-[0_0_8px_rgba(34,158,217,0.75)] group-active:drop-shadow-[0_0_10px_rgba(124,58,237,0.75)]"
                  />
                  <span className="font-semibold">{SUPPORT_TELEGRAM.replace('https://t.me/', '@')}</span>
                </a>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="group inline-flex min-h-11 items-center gap-3 text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                  aria-label="Email QuickXchange support"
                  data-testid="link-contact-email"
                >
                  <Mail
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 text-primary transition duration-200 group-hover:drop-shadow-[0_0_8px_rgba(6,182,212,0.75)] group-active:drop-shadow-[0_0_10px_rgba(124,58,237,0.75)]"
                  />
                  <span className="font-semibold">{SUPPORT_EMAIL}</span>
                </a>
              </div>
            </div>

            {/* Right Column: Form */}
            <div className="contact-redesign-panel p-8 md:p-10">
              <h2 className="text-2xl font-marketing font-bold text-foreground mb-8">Contact Form</h2>
              <form className="space-y-6" onSubmit={onSubmit} noValidate>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider" htmlFor="contact-name">Name</label>
                    <input id="contact-name" className="w-full h-14 bg-input border border-border rounded-xl px-4 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider" htmlFor="contact-email">Email</label>
                    <input id="contact-email" className="w-full h-14 bg-input border border-border rounded-xl px-4 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" type="email" required maxLength={320} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider" htmlFor="contact-message">Message</label>
                  <textarea id="contact-message" className="w-full min-h-[160px] bg-input border border-border rounded-xl p-4 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-y" required maxLength={5000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help you today?" />
                </div>
                {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}
                <button className="contact-btn-gradient w-full h-14 font-bold rounded-xl flex items-center justify-center gap-2" type="submit" disabled={submit.isPending}>
                  {submit.isPending ? <Loader2 size={18} className="animate-spin" /> : null} 
                  Send
                </button>
              </form>
            </div>
          </div>

          <div className="contact-redesign-panel max-w-2xl mx-auto text-center p-8 md:p-10">
            <h2 className="text-3xl font-marketing font-bold text-foreground mb-4">Stay in touch</h2>
            <p className="text-muted-foreground mb-8">Subscribe to our newsletter so you don’t miss any updates.</p>
            <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" onSubmit={onNewsletterSubmit} noValidate>
              <input
                type="email"
                className="flex-1 h-12 bg-input border border-border rounded-xl px-4 text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder="Email address"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
              />
              <button type="submit" disabled={newsletterSubmit.isPending} className="h-12 px-8 bg-foreground text-background font-bold rounded-xl hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-60" data-testid="button-newsletter-subscribe">
                {newsletterSubmit.isPending ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'Subscribe'}
              </button>
            </form>
            {newsletterNotice && (
              <div className="mt-4 max-w-md mx-auto text-left">
                <InlineNotice kind={newsletterNotice.kind}>{newsletterNotice.text}</InlineNotice>
              </div>
            )}
          </div>
        </div>
      </ManagedContent>
    </PublicShell>
  );
}

// 4. Privacy Policy
export function PrivacyPolicyPage() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });

  const content = preview.active && preview.pageKey === 'privacy-policy'
    ? preview.content
    : published.data?.pages?.find(p => p.pageKey === 'privacy-policy')?.content;

  if ((content?.visibility as any)?.enabled === false) return <NotFound />;

  const title = contentValue(content, ['title', 'headline', 'heading'], "Privacy Policy");
  const subtitle = contentValue(content, ['subtitle', 'intro', 'description', 'body'], "Your privacy and data security are our highest priorities. Learn how we handle, protect, and process your information.");
  const heroImagePath = (content?.heroImage as any)?.objectPath;
  const heroImageAlt = (content?.heroImage as any)?.altText;
  const seoTitle = (content?.seo as any)?.title || "Privacy Policy";
  const seoDesc = (content?.seo as any)?.description || "Your privacy and data security are our highest priorities. Learn how we handle, protect, and process your information.";
  const configuredSections = Array.isArray(content?.legalSections) ? content.legalSections : [];
  const sections = PRIVACY_NOTICE_SECTIONS.map((fallback, index) => {
    const configured = configuredSections[index];
    if (!configured || typeof configured !== 'object') return fallback;
    const section = configured as Record<string, unknown>;
    return {
      heading: contentValue(section, ['heading', 'title'], fallback.heading),
      body: contentValue(section, ['body', 'description', 'text'], fallback.body),
    };
  });

  return (
    <PublicShell>
      <SEO title={seoTitle} description={seoDesc} />
      <HeroSection title={title} subtitle={subtitle} imagePath={heroImagePath} imageAlt={heroImageAlt} privacyGlow />
      <PageContainer className="privacy-content-glow">
         {sections.map((section, index) => (
           <ContentCard title={section.heading} className="privacy-policy-card" key={index}>
             <p className="whitespace-pre-wrap">{section.body}</p>
           </ContentCard>
         ))}
      </PageContainer>
    </PublicShell>
  );
}

// 5. Terms & Conditions
export function TermsConditionsPage() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });

  const content = preview.active && preview.pageKey === 'terms-conditions'
    ? preview.content
    : published.data?.pages?.find(p => p.pageKey === 'terms-conditions')?.content;

  if ((content?.visibility as any)?.enabled === false) return <NotFound />;

  const title = contentValue(content, ['title', 'headline', 'heading'], "Terms & Conditions");
  const subtitle = contentValue(content, ['subtitle', 'intro', 'description', 'body'], "Please read these terms carefully before using our platform. They outline your rights and responsibilities.");
  const heroImagePath = (content?.heroImage as any)?.objectPath;
  const heroImageAlt = (content?.heroImage as any)?.altText;
  const seoTitle = (content?.seo as any)?.title || "Terms & Conditions";
  const seoDesc = (content?.seo as any)?.description || "Please read these terms carefully before using our platform. They outline your rights and responsibilities.";
  const configuredSections = Array.isArray(content?.legalSections) ? content.legalSections : [];
  const sections = TERMS_NOTICE_SECTIONS.map((fallback, index) => {
    const configured = configuredSections[index];
    if (!configured || typeof configured !== 'object') return fallback;
    const section = configured as Record<string, unknown>;
    return {
      heading: contentValue(section, ['heading', 'title'], fallback.heading),
      body: contentValue(section, ['body', 'description', 'text'], fallback.body),
    };
  });

  return (
    <PublicShell>
      <SEO title={seoTitle} description={seoDesc} />
      <HeroSection title={title} subtitle={subtitle} imagePath={heroImagePath} imageAlt={heroImageAlt} termsGlow />
      <PageContainer className="terms-content-glow">
         {sections.map((section, index) => (
           <ContentCard title={section.heading} className="terms-policy-card" key={index}>
             <p className="whitespace-pre-wrap">{section.body}</p>
           </ContentCard>
         ))}
      </PageContainer>
    </PublicShell>
  );
}

// 6. AML/KYC
export function AmlKycPage() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });

  const content = preview.active && preview.pageKey === 'aml-kyc'
    ? preview.content
    : published.data?.pages?.find(p => p.pageKey === 'aml-kyc')?.content;

  if ((content?.visibility as any)?.enabled === false) return <NotFound />;

  const title = contentValue(content, ['title', 'headline', 'heading'], "AML & KYC Policy");
  const subtitle = contentValue(content, ['subtitle', 'intro', 'description', 'body'], "We maintain strict compliance standards to prevent financial crime and ensure a secure trading environment.");
  const heroImagePath = (content?.heroImage as any)?.objectPath;
  const heroImageAlt = (content?.heroImage as any)?.altText;
  const seoTitle = (content?.seo as any)?.title || "AML & KYC Policy";
  const seoDesc = (content?.seo as any)?.description || "We maintain strict compliance standards to prevent financial crime and ensure a secure trading environment.";

  return (
    <PublicShell>
      <SEO title={seoTitle} description={seoDesc} />
      <HeroSection title={title} subtitle={subtitle} imagePath={heroImagePath} imageAlt={heroImageAlt} amlGlow />
      <PageContainer className="aml-content-glow">
        <ManagedContent content={content}>
        <ContentCard title="Anti-Money Laundering (AML) Framework" className="aml-policy-card">
          <p>
             QuickXchange takes measures intended to reduce the risk that its services are used for money laundering, terrorist financing, fraud, sanctions evasion, or other prohibited activity.
          </p>
          <p>
             Orders may be reviewed, delayed, rejected, or cancelled when information is incomplete, a route requires additional checks, or activity presents legal, sanctions, fraud, or security concerns. Information may be requested or disclosed where required by applicable law.
          </p>
        </ContentCard>

        <ContentCard title="Know Your Customer (KYC) Requirements" className="aml-policy-card">
          <p>
             Identity or source-of-funds information may be required depending on the selected route, amount, risk indicators, service provider requirements, and applicable law.
          </p>
          <div className="aml-verification-card bg-muted/30 rounded-2xl p-6 mt-6 border border-border">
            <h3 className="font-bold text-foreground mb-4">Verification levels typically require:</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
              <li>A valid government-issued identity document (Passport, National ID, or Driver's License).</li>
              <li>Proof of residential address (Utility bill or bank statement dated within the last 3 months).</li>
              <li>Liveness verification (A facial scan or selfie).</li>
              <li>In certain cases, source of funds documentation for high-volume transactions.</li>
            </ul>
          </div>
        </ContentCard>
        </ManagedContent>
      </PageContainer>
    </PublicShell>
  );
}
