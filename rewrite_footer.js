const fs = require('fs');
const file = 'artifacts/crypto-exchange-widget/src/components/public-shell.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /const hasSocial = Boolean\(socialItems.length(.|\n)*?<\/details>\n            <\/div>/m;
const replacement = `const hasSocial = Boolean(socialItems.length || socialTrust?.instagramUrl || socialTrust?.xUrl || socialTrust?.facebookUrl || trustItems.length);

  const footerNavigationGroups = [
    { title: 'Company', links: companyFooterLinks, type: 'links' },
    { title: 'Exchange', links: exchangeFooterLinks, type: 'links' },
    { title: 'Information', links: informationFooterLinks, type: 'links' },
    { title: 'Contacts', type: 'custom', content: (
      <>
        <span className="public-footer-link flex items-center gap-2 cursor-default select-none" data-testid="text-footer-working-hours">
          <Clock3 size={15} />
          {SUPPORT_HOURS}
        </span>
        <a href={SUPPORT_TELEGRAM} target="_blank" rel="noreferrer noopener" className="public-footer-link hover:text-primary transition-colors flex items-center gap-2" data-testid="link-published-footer-support-telegram">
          <SiTelegram size={14} className="opacity-80" />
          Telegram Support
        </a>
        <a href={\`mailto:\${SUPPORT_EMAIL}\`} className="public-footer-link hover:text-primary transition-colors flex items-center gap-2" data-testid="link-published-footer-support-email">
          <Mail size={15} />
          Support Email
        </a>
      </>
    ) }
  ];

  return <div className="min-h-[100dvh] noise public-shell flex flex-col">
    <PublicHeader />
    <main className="flex-1">
      {children}
    </main>
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 mt-16 sm:mt-24">
      <footer className="qx-premium-footer">
        <div className="qx-premium-footer-bg">
          <div className="qx-premium-footer-glow" />
          <svg className="qx-premium-footer-globe" viewBox="0 0 800 400" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g stroke="currentColor" strokeWidth="1">
              <ellipse cx="400" cy="200" rx="300" ry="150" />
              <ellipse cx="400" cy="200" rx="150" ry="150" />
              <path d="M100,200 L700,200" />
              <path d="M400,50 L400,350" />
              <path d="M188,94 L612,306" />
              <path d="M188,306 L612,94" />
            </g>
          </svg>
        </div>

        <div className="qx-premium-footer-inner">
          <div className="hidden md:grid grid-cols-4 lg:grid-cols-12 gap-8 mb-12">
            <div className="col-span-4 lg:col-span-4 flex flex-col items-start gap-6">
              <BrandLogo />
              <p className="qx-footer-tagline">Your Crypto Exchange Partner</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Fast. Secure. Global. Exchange, convert and move your crypto with confidence.
              </p>
               {hasSocial && (
                <div className="mt-2">
                   <FooterSocialLinksDataDriven
                     socialTrust={socialTrust as SocialTrustConfig | undefined}
                     socialItems={socialItems}
                    trustItems={trustItems}
                    preview={preview}
                  />
                </div>
              )}
            </div>

            {footerNavigationGroups.map((group, index) => (
              <div key={group.title} className={cn("col-span-1 lg:col-span-2 flex flex-col gap-4", index === 0 && "lg:col-start-5")}>
                <strong className="text-foreground text-xs font-bold tracking-widest uppercase">{group.title}</strong>
                <nav className="flex flex-col gap-2.5 text-sm text-muted-foreground" aria-label={\`\${group.title} navigation\`}>
                  {group.type === 'links' ? <ConfiguredLinks links={group.links!} placement="footer" /> : group.content}
                </nav>
              </div>
            ))}
          </div>

          <div className="md:hidden flex flex-col mb-8 gap-6">
            <div className="flex flex-col gap-5">
              <BrandLogo />
              <p className="qx-footer-tagline">Your Crypto Exchange Partner</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fast. Secure. Global. Exchange, convert and move your crypto with confidence.
              </p>
               {hasSocial && (
                <div className="mt-2">
                   <FooterSocialLinksDataDriven
                     socialTrust={socialTrust as SocialTrustConfig | undefined}
                     socialItems={socialItems}
                    trustItems={trustItems}
                    preview={preview}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col border-y border-border/10 divide-y divide-border/10 mt-2">
              {footerNavigationGroups.map((group) => (
                <details key={group.title} className="qx-footer-mobile-group group" name="qx-footer-nav">
                  <summary className="qx-footer-mobile-summary flex items-center justify-between py-4 text-xs font-bold uppercase tracking-widest text-foreground cursor-pointer list-none outline-none">
                    {group.title}
                    <ChevronDown size={16} className="text-muted-foreground transition-transform group-open:-rotate-180" />
                  </summary>
                  <div className="flex flex-col gap-3 pb-4 text-sm text-muted-foreground">
                    {group.type === 'links' ? <ConfiguredLinks links={group.links!} placement="footer" /> : group.content}
                  </div>
                </details>
              ))}
            </div>`;

if (!regex.test(content)) {
  console.log("Regex didn't match.");
  process.exit(1);
}

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
