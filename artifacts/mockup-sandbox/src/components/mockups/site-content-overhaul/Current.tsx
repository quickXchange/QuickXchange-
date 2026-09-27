import { useState } from 'react';
import { Inbox, ImagePlus, Link2, Save, Share2, Upload } from 'lucide-react';
import './_group.css';

const managementAreas = [
  ['pages', 'Pages'],
  ['navigation', 'Navigation'],
  ['logos', 'Partner logos'],
  ['social-trust', 'Social Media'],
  ['inbox', 'Contact inbox'],
] as const;

const editablePages = [
  ['home', 'Home'],
  ['convert', 'Convert'],
  ['swap', 'Swap'],
  ['market-rates', 'Market Rates'],
  ['operations', 'Operations'],
  ['about-us', 'About Us'],
  ['affiliate-program', 'Affiliate Program'],
  ['contact-us', 'Contact Us'],
  ['privacy-policy', 'Privacy Policy'],
  ['terms-conditions', 'Terms & Conditions'],
  ['aml-kyc', 'AML / KYC'],
] as const;

export function Current() {
  const [tab, setTab] = useState<(typeof managementAreas)[number][0]>('pages');
  const [pageKey, setPageKey] = useState<(typeof editablePages)[number][0]>('home');
  const [visible, setVisible] = useState(true);
  const [seoTitle, setSeoTitle] = useState('QuickXChange | Fast Crypto Exchange');
  const [seoDescription, setSeoDescription] = useState('Buy, sell, and convert cryptocurrency with secure global payments.');
  const [navigationLabel, setNavigationLabel] = useState('Home');

  const pageLabel = editablePages.find(([key]) => key === pageKey)?.[1] ?? 'Home';
  const parsedContent = {
    visibility: { enabled: visible },
    seo: { title: seoTitle, description: seoDescription },
    navigation: { label: navigationLabel, header: { enabled: true }, footer: { enabled: true } },
  };
  const pageDefaults = { defaultHeader: true, defaultFooter: true };
  const updateField = (key: string, value: any) => {
    if (key === 'visibility') setVisible(value.enabled);
    if (key === 'seo') {
      setSeoTitle(value.title);
      setSeoDescription(value.description);
    }
    if (key === 'navigation') setNavigationLabel(value.label);
  };

  return (
    <div className="admin-shell admin-redesign site-content-current min-h-screen">
      <aside className="admin-sidebar" aria-label="Operations">
        <div className="site-content-brand">
          <span className="site-content-brand-mark">Q</span>
          <span>QuickXChange</span>
        </div>
        <div className="admin-sidebar-group-title">Configuration</div>
        <div className="sidebar-link active">
          <span className="sidebar-link-icon"><Save size={17} /></span>
          <span className="sidebar-link-label">Site content</span>
        </div>
        <div className="site-content-sidebar-meta">
          <span className="site-content-online-dot" />
          Admin console <small>Workspace</small>
        </div>
      </aside>

      <main className="admin-content min-w-0">
        <header className="site-content-topbar">
          <div className="admin-heading">
            <span className="section-kicker">CONTENT MANAGEMENT</span>
            <h1>Public site content</h1>
            <p>Draft, preview, publish, and manage the public experience without changing exchange logic.</p>
          </div>
          <div className="site-content-user"><span>O</span><div><strong>Operations</strong><small>Administrator</small></div></div>
        </header>

        <div className="admin-main">
          <section className="panel mb-6 flex flex-col gap-4 border-primary/30 bg-primary/5 p-5 lg:flex-row lg:items-center lg:justify-between" data-testid="site-publication-status">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">Navigation and partner-logo publication</h2>
                <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700">Unpublished changes</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Published state: 7 navigation links and 4 partner logos. Last published v12.
              </p>
            </div>
            <button type="button" className="button button-primary shrink-0" data-testid="button-publish-site-snapshot">
              <Upload size={15} />
              Publish site snapshot
            </button>
          </section>

          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Site management areas">
            {managementAreas.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={`button ${tab === value ? 'button-primary' : 'button-secondary'}`} onClick={() => setTab(value)} data-testid={`tab-site-management-${value}`}>{value === 'pages' ? <Save size={15} /> : value === 'navigation' ? <Link2 size={15} /> : value === 'logos' ? <ImagePlus size={15} /> : value === 'social-trust' ? <Share2 size={15} /> : <Inbox size={15} />}{label}</button>)}
          </div>

          <section className="space-y-6" data-testid="site-content-editor">
            <div className="site-content-page-tabs" role="tablist" aria-label="Editable public pages">
              {editablePages.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={pageKey === key} className={`button h-9 px-3 text-xs ${pageKey === key ? 'button-primary' : 'button-secondary'}`} onClick={() => setPageKey(key)} data-testid={`tab-site-page-${key}`}>{label}</button>)}
            </div>
            <div className="site-content-editor-excerpt">
              <div className="panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{pageLabel} draft</h2>
                    <div className="flex gap-2 mt-2">
                      <button type="button" className="text-xs font-semibold px-2 py-1 rounded-md transition-colors bg-primary/10 text-primary">Visual Editor</button>
                      <button type="button" className="text-xs font-semibold px-2 py-1 rounded-md transition-colors text-muted-foreground">Advanced JSON</button>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">Published v12</span>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-sm font-semibold p-3 border border-border rounded-lg bg-muted/30">
                     <input type="checkbox" checked={parsedContent.visibility?.enabled ?? true} onChange={(e) => updateField('visibility', { ...parsedContent.visibility, enabled: e.target.checked })} data-testid="input-page-visible" />
                    Page is Visible to Public
                  </label>

                  <div className="grid gap-4 bg-muted/10 p-4 rounded-xl border border-border">
                    <h3 className="font-bold text-sm">SEO &amp; Navigation</h3>
                     <input className="admin-input" placeholder="SEO Title" value={parsedContent.seo?.title || ''} onChange={(e) => updateField('seo', { ...parsedContent.seo, title: e.target.value })} data-testid="input-page-seo-title" />
                     <textarea className="admin-input h-20" placeholder="SEO Description" value={parsedContent.seo?.description || ''} onChange={(e) => updateField('seo', { ...parsedContent.seo, description: e.target.value })} data-testid="input-page-seo-description" />
                     <input className="admin-input" placeholder="Navigation label" value={parsedContent.navigation?.label || ''} onChange={(e) => updateField('navigation', { ...parsedContent.navigation, label: e.target.value })} data-testid="input-page-navigation-label" />
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="space-y-2 border border-border rounded-lg p-3">
                         <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={parsedContent.navigation?.header?.enabled ?? pageDefaults?.defaultHeader ?? false} onChange={(e) => updateField('navigation', { ...parsedContent.navigation, header: { ...parsedContent.navigation?.header, enabled: e.target.checked } })} data-testid="input-page-navigation-header" /> Show in Header</label>
                      </div>
                      <div className="space-y-2 border border-border rounded-lg p-3">
                         <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={parsedContent.navigation?.footer?.enabled ?? pageDefaults?.defaultFooter ?? false} onChange={(e) => updateField('navigation', { ...parsedContent.navigation, footer: { ...parsedContent.navigation?.footer, enabled: e.target.checked } })} data-testid="input-page-navigation-footer" /> Show in Footer</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}