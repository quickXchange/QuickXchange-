const fs = require('fs');
const file = 'artifacts/crypto-exchange-widget/src/pages/public-info-pages.tsx';
let content = fs.readFileSync(file, 'utf8');

const startMarker = '// 3. Contact Us\nexport function ContactUsPage() {';
const endMarker = '// 4. Privacy Policy\nexport function PrivacyPolicyPage() {';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find markers');
  process.exit(1);
}

const replacement = `// 3. Contact Us
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

  const socialTrust = preview.active && preview.socialTrust ? preview.socialTrust : published.data?.socialTrust;
  const socialItems = (socialTrust?.items ?? []).filter(i => i.enabled && i.group === 'social').sort((a, b) => a.sortOrder - b.sortOrder);

  const valid = form.name.trim().length >= 1 && form.name.trim().length <= 120 &&
    /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email) && form.email.length <= 320 &&
    form.message.trim().length >= 1 && form.message.length <= 5000;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!valid) { setNotice({ kind: 'error', text: 'Please enter a valid name, email address, and message.' }); return; }
    submit.mutate({ data: { name: form.name.trim(), email: form.email.trim(), message: form.message.trim() } }, {
      onSuccess: () => { setForm({ name: '', email: '', message: '' }); setNotice({ kind: 'success', text: 'Thank you. Your message has been received by our support team.' }); },
      onError: () => setNotice({ kind: 'error', text: 'Unable to send your message right now. Please try again later.' }),
    });
  };

  const onNewsletterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewsletterNotice(null);
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(newsletterEmail)) {
      setNewsletterNotice({ kind: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    setNewsletterNotice({ kind: 'error', text: 'Newsletter signup is not available yet.' });
  };

  return (
    <PublicShell>
      <SEO title={seoTitle} description={seoDesc} />
      <ManagedContent content={content} preserveChildren>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24 space-y-24">
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
                <div className="contact-redesign-card">
                  <div className="contact-redesign-icon">
                    <Search size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">Check your swap status</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Track your order in real-time.</p>
                  </div>
                </div>

                <div className="contact-redesign-card">
                  <div className="contact-redesign-icon">
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">How to use our service</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Simple step-by-step guides.</p>
                  </div>
                </div>

                <div className="contact-redesign-card">
                  <div className="contact-redesign-icon">
                    <HelpCircle size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">Frequently asked questions</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Find answers to common questions.</p>
                  </div>
                </div>
              </div>

              {socialItems.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground mb-6">Follow us on social media</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    {socialItems.map((item) => (
                      <a key={item.id} href={item.href} target="_blank" rel="noreferrer" aria-label={item.name} className="w-12 h-12 rounded-full bg-muted/50 hover:bg-muted transition-colors flex items-center justify-center border border-border/50">
                         <img src={preview.assetUrls?.[item.objectPath] ?? (preview.active ? \`\${basePath}/api/admin/social-trust/items/\${item.id}/preview\` : \`\${basePath}/api/storage/objects/social-trust-icons/\${item.objectPath.split('/').pop()}\`)} alt={item.name} className="w-5 h-5 object-contain" loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Form */}
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-[2rem] p-8 md:p-12 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[var(--qx-gradient)] opacity-70" />
              <h3 className="text-2xl font-marketing font-bold text-foreground mb-8">Send a message</h3>
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
                  Send Message
                </button>
              </form>
            </div>
          </div>

          {/* Newsletter Section */}
          <div className="max-w-2xl mx-auto text-center pt-8 border-t border-border/50">
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
              <button type="submit" className="h-12 px-8 bg-foreground text-background font-bold rounded-xl hover:opacity-90 transition-opacity">
                Subscribe
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

`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(file, newContent);
console.log('File updated successfully');
