import { useState } from 'react';
import { Eye, ImagePlus, Inbox, Link2, Save, Share2, Upload } from 'lucide-react';
import './_group.css';
import './After.css';

const managementAreas = [
  ['pages', 'Pages'],
  ['navigation', 'Navigation'],
  ['logos', 'Partner Logos'],
  ['social-trust', 'Social Media'],
  ['trust', 'Feedback / Trust'],
  ['inbox', 'Contact'],
  ['other', 'Other'],
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

export function After() {
  const [tab, setTab] = useState<(typeof managementAreas)[number][0]>('pages');
  const [pageKey, setPageKey] = useState<(typeof editablePages)[number][0]>('home');
  const [visible, setVisible] = useState(true);
  const [seoTitle, setSeoTitle] = useState('QuickXChange | Fast Crypto Exchange');
  const [seoDescription, setSeoDescription] = useState('Buy, sell, and convert cryptocurrency with secure global payments.');
  const [navigationLabel, setNavigationLabel] = useState('Home');
  const [headerVisible, setHeaderVisible] = useState(true);
  const [footerVisible, setFooterVisible] = useState(true);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [published, setPublished] = useState(false);

  const pageLabel = editablePages.find(([key]) => key === pageKey)?.[1] ?? 'Home';
  const areaLabel = managementAreas.find(([key]) => key === tab)?.[1] ?? 'Pages';

  return (
    <div className="admin-shell admin-redesign sc-after-shell">
      <aside className="admin-sidebar" aria-label="Operations">
        <div className="site-content-brand"><span className="site-content-brand-mark">Q</span><span>QuickXChange</span></div>
        <div className="sc-after-workspace"><span className="sc-after-workspace-mark">◆</span><span>Admin workspace</span></div>
        <div className="admin-sidebar-group-title">Workspace</div>
        <div className="sc-after-side-link"><span>◫</span>Overview</div>
        <div className="admin-sidebar-group-title">Configuration</div>
        <div className="sidebar-link active"><span className="sidebar-link-icon"><Save size={16} /></span><span className="sidebar-link-label">Site content</span></div>
        <div className="sc-after-side-link"><span>⚙</span>Exchange settings</div>
        <div className="site-content-sidebar-meta"><span className="site-content-online-dot" /><span>Admin console</span><small>Workspace · Production</small></div>
      </aside>

      <main className="admin-content min-w-0">
        <header className="site-content-topbar">
          <div className="sc-after-breadcrumb"><span>Admin</span><span>/</span><strong>Site content</strong></div>
          <div className="site-content-user"><span>O</span><div><strong>Operations</strong><small>Administrator</small></div></div>
        </header>
        <div className="admin-main">
          <div className="site-content-admin">
            <div className="sc-intro">
              <div><span className="sc-overline">QUICKXCHANGE / SITE SETTINGS</span><h1>Public site content</h1><p>Make changes carefully. Every section keeps a private draft until you choose to publish it.</p></div>
              <span className="sc-workspace-tag">Operator workspace</span>
            </div>

            <section className="panel sc-publication" data-testid="site-publication-status">
              <div>
                <div className="sc-after-status-line"><h3>Site snapshot publication</h3><span className="sc-status" data-pending={!published}>{published ? 'Published v13' : 'Unpublished changes'}</span></div>
                <p>Published state: 7 navigation links and 4 partner logos. {published ? 'Just published as v13.' : 'Last published v12.'}</p>
                <p className="sc-publication-rule">Navigation, partner logos, social media, and feedback / trust go live together in this snapshot. Pages and Other are published individually in their editors.</p>
              </div>
              <button type="button" className="button button-primary" onClick={() => setPublished(true)} data-testid="button-publish-site-snapshot"><Upload size={15} />{published ? 'Snapshot published' : 'Publish site snapshot'}</button>
            </section>

            <div className="sc-main-tabs" role="tablist" aria-label="Site management areas">
              {managementAreas.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} data-testid={`tab-site-management-${value}`}>
                {value === 'pages' || value === 'other' ? <Save size={15} /> : value === 'navigation' ? <Link2 size={15} /> : value === 'logos' ? <ImagePlus size={15} /> : value === 'inbox' ? <Inbox size={15} /> : <Share2 size={15} />}{label}
              </button>)}
            </div>

            <section className="sc-after-tab-panel" role="tabpanel" aria-label={`${areaLabel} editor`}>
              {tab === 'pages' ? <>
                <div className="sc-section-head"><h2>Page content</h2><p>Edit page details, search metadata, and where this page appears across the public site.</p></div>
                <div className="sc-page-tabs" role="tablist" aria-label="Editable public pages">
                  {editablePages.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={pageKey === key} onClick={() => setPageKey(key)} data-testid={`tab-site-page-${key}`}>{label}</button>)}
                </div>
                <div className="sc-editor-grid">
                  <div className="panel sc-editor-card">
                    <div className="sc-after-editor-head">
                      <div><span className="sc-after-eyebrow">PAGE EDITOR</span><h2>{pageLabel}</h2><p>Draft content · Last edited today at 10:42 AM</p></div>
                      <span className="sc-after-version">Published v12</span>
                    </div>
                    <div className="sc-after-mode" role="tablist" aria-label="Editor mode">
                      <button type="button" className={editorMode === 'visual' ? 'is-active' : ''} onClick={() => setEditorMode('visual')}>Visual editor</button>
                      <button type="button" className={editorMode === 'json' ? 'is-active' : ''} onClick={() => setEditorMode('json')}>Advanced JSON</button>
                    </div>
                    {editorMode === 'visual' ? <div className="sc-after-fields">
                      <label className="sc-after-visible"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} data-testid="input-page-visible" /><span><strong>Page is visible to the public</strong><small>Visitors can access this page from the public site.</small></span><span className={`sc-after-switch ${visible ? 'on' : ''}`} /></label>
                      <div className="sc-after-field-heading"><div><h3>SEO &amp; navigation</h3><p>Control how this page appears in search and site menus.</p></div><span className="sc-after-step">01</span></div>
                      <label className="sc-after-label">SEO title<input className="admin-input" placeholder="SEO Title" value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} data-testid="input-page-seo-title" /><small>{seoTitle.length}/60 characters</small></label>
                      <label className="sc-after-label">SEO description<textarea className="admin-input" placeholder="SEO Description" value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} data-testid="input-page-seo-description" /><small>Recommended length: 150–160 characters</small></label>
                      <label className="sc-after-label">Navigation label<input className="admin-input" placeholder="Navigation label" value={navigationLabel} onChange={(event) => setNavigationLabel(event.target.value)} data-testid="input-page-navigation-label" /></label>
                      <div className="sc-after-placement">
                        <h3>Show this page in</h3>
                        <label><input type="checkbox" checked={headerVisible} onChange={(event) => setHeaderVisible(event.target.checked)} data-testid="input-page-navigation-header" /><span><strong>Header navigation</strong><small>Top-level site navigation</small></span></label>
                        <label><input type="checkbox" checked={footerVisible} onChange={(event) => setFooterVisible(event.target.checked)} data-testid="input-page-navigation-footer" /><span><strong>Footer navigation</strong><small>Links shown in the site footer</small></span></label>
                      </div>
                    </div> : <pre className="sc-after-json">{JSON.stringify({ visibility: { enabled: visible }, seo: { title: seoTitle, description: seoDescription }, navigation: { label: navigationLabel, header: { enabled: headerVisible }, footer: { enabled: footerVisible } } }, null, 2)}</pre>}
                    <div className="sc-action-row"><button type="button" className="button button-secondary" onClick={() => setEditorMode('visual')}>Discard draft</button><span className="sc-after-saved"><i /> Draft saved just now</span><button type="button" className="button button-primary" onClick={() => setPublished(true)}><Save size={14} />Save &amp; publish page</button></div>
                  </div>
                  <aside className="panel sc-editor-card sc-after-preview">
                    <div className="sc-after-preview-head"><div><span className="sc-after-eyebrow">LIVE PREVIEW</span><h3>QuickXChange website</h3></div><button type="button" aria-label="Open page preview"><Eye size={16} /></button></div>
                    <div className="sc-after-browser"><div className="sc-after-browser-bar"><i /><i /><i /><span>quickxchange.com/{pageKey === 'home' ? '' : pageKey}</span></div><div className="sc-after-preview-site"><div className="sc-after-preview-nav"><b><span>Q</span> QuickXChange</b><span>Convert　 Rates　 About us</span><button type="button">Get started</button></div><div className="sc-after-hero-label">FAST · SECURE · GLOBAL</div><h3>{pageKey === 'home' ? 'Move your money.' : pageLabel + ', made simple.'}<br /><em>Without the wait.</em></h3><p>Buy, sell, and convert digital assets with confidence.</p><button type="button">Explore exchange <span>→</span></button><div className="sc-after-preview-glow" /></div></div>
                    <div className="sc-after-preview-note"><span className="sc-after-check">✓</span><span><strong>Preview reflects your draft</strong><small>Changes are visible here before publishing.</small></span></div>
                  </aside>
                </div>
              </> : <div className="sc-after-placeholder"><span className="sc-after-placeholder-icon">{tab === 'navigation' ? <Link2 /> : tab === 'logos' ? <ImagePlus /> : tab === 'inbox' ? <Inbox /> : <Share2 />}</span><span className="sc-after-eyebrow">{areaLabel.toUpperCase()}</span><h2>{areaLabel} workspace</h2><p>This area has its own draft and publishing controls in the site content workspace.</p><button type="button" className="button button-secondary" onClick={() => setTab('pages')}>Return to Pages editor</button></div>}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}