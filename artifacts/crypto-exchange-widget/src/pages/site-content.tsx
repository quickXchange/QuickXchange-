import { useEffect, useState, useMemo, useRef } from 'react';
import type { FormEvent } from 'react';
import { Eye, ExternalLink, ImagePlus, Inbox, Link2, Loader2, Pause, Play, Plus, Save, Trash2, Upload, X, Share2 } from 'lucide-react';
import {
  getGetAdminSiteContentQueryKey,
  getListAdminNavigationQueryKey,
  getListAdminPartnerLogosQueryKey,
  getListContactSubmissionsQueryKey,
  getGetPublishedSiteContentQueryKey,
  getGetPublishedNavigationQueryKey,
  getGetPublishedPartnerLogosQueryKey,
  getPreviewAdminPartnerLogoQueryKey,
  getGetAdminSocialTrustQueryKey,
  getPreviewAdminSocialTrustIconQueryKey,
  useGetPublishedNavigation,
  useGetPublishedPartnerLogos,
  useCreateContactSubmission,
  useGetPublishedSiteContent,
  useCreateAdminPartnerLogo,
  useGetAdminSiteContent,
  useListAdminNavigation,
  useListAdminPartnerLogos,
  useListContactSubmissions,
  usePublishAdminSitePage,
  usePublishSitePublication,
  usePreviewAdminPartnerLogo,
  previewAdminPartnerLogo,
  previewAdminSitePageMedia,
  previewAdminSocialTrustIcon,
  useRemoveAdminNavigation,
  useRemoveAdminPartnerLogo,
  useRequestPartnerLogoUpload,
  useRequestSitePageMediaUpload,
  useSaveAdminNavigation,
  useSaveAdminSitePage,
  useUpdateAdminPartnerLogo,
  useGetAdminSocialTrust,
  useUpdateAdminSocialTrustTitles,
  useUpdateAdminSocialMedia,
  useRequestSocialTrustIconUpload,
  useCreateAdminSocialTrustItem,
  useUpdateAdminSocialTrustItem,
  useRemoveAdminSocialTrustItem,
  usePreviewAdminSocialTrustIcon,
} from '@workspace/api-client-react';
import type {
  ImageUploadInputContentType,
  PartnerLogo,
  SiteNavLink,
  SiteNavLinkInput,
  SitePageKey,
  SocialTrustConfig,
  SocialTrustItem,
  SocialTrustItemInputGroup,
  SocialTrustItemUpdateGroup,
  SocialIconAppearance,
} from '@workspace/api-client-react';
import { AdminShell, apiErrorData, apiErrorText, cn, InlineNotice, LoadingBlock, queryClient } from '../App';
import { basePath } from '../components/shared-app-ui';
import { EDITABLE_PUBLIC_PAGES } from '../lib/public-page-registry';
import { PublicShell } from '../components/public-shell';
import NotFound from './not-found';
import { LivePreviewFrame } from '../components/live-preview-frame';
import { PRIVACY_NOTICE_SECTIONS, TERMS_NOTICE_SECTIONS } from '../lib/legal-page-content';
import { useAdminPermissions } from '../lib/admin-permissions';

const WIDGET_EXCHANGE_INFORMATION_KEY = 'widget-exchange-information' as SitePageKey;
const SITE_CONTENT_EDITOR_SECTIONS = [
  ...EDITABLE_PUBLIC_PAGES,
  { key: WIDGET_EXCHANGE_INFORMATION_KEY, label: 'Widget Exchange Information' },
];
export const SITE_PAGE_KEYS = SITE_CONTENT_EDITOR_SECTIONS.map(p => p.key as SitePageKey);
const PAGE_LABELS = Object.fromEntries(SITE_CONTENT_EDITOR_SECTIONS.map(p => [p.key, p.label])) as Record<SitePageKey, string>;

type Notice = { kind: 'success' | 'error'; text: string };

const automaticNavigationOrder = (left: Pick<SiteNavLink, 'label' | 'href' | 'id' | 'enabled'>, right: Pick<SiteNavLink, 'label' | 'href' | 'id' | 'enabled'>) =>
  Number(right.enabled) - Number(left.enabled)
  || left.label.localeCompare(right.label)
  || left.href.localeCompare(right.href)
  || left.id.localeCompare(right.id);

const automaticNameOrder = (left: { name: string; href?: string; id: string; enabled?: boolean }, right: { name: string; href?: string; id: string; enabled?: boolean }) =>
  Number(Boolean(right.enabled)) - Number(Boolean(left.enabled))
  || left.name.localeCompare(right.name)
  || (left.href ?? '').localeCompare(right.href ?? '')
  || left.id.localeCompare(right.id);

const ABOUT_DIFFERENCE_POINTS = [
  {
    title: 'Transfer with confidence',
    description: "We understand the importance of executing transactions safely and efficiently. That's why we operate around-the-clock, utilizing a global network of banks and e-wallets to ensure our customers receive the best service possible. Trust us to handle your transactions with speed and security.",
  },
  {
    title: 'Effortless Money Transfers',
    description: 'With our platform, sending and receiving money has never been easier. Our user-friendly interface enables you to complete transactions with just a few clicks. Plus, our dedicated support team is available round-the-clock to provide prompt assistance with any inquiries or concerns you may have. Choose us for hassle-free money transfers!',
  },
  {
    title: 'Experience the Difference',
    description: "At our company, we strive to offer a wide range of services to our customers while providing exceptional customer service. Our top priorities are security and performance, while also ensuring that our platform is user-friendly and convenient. With our team's creative ideas and dedication, we aim to make a significant impact in the global market.",
  },
  {
    title: 'Time is Money',
    description: "We know that in today's fast-paced world, time is of the essence. That's why we promise to provide our customers with swift, secure, and straightforward financial services, ensuring that their needs always come first. Our team is dedicated to delivering the best possible experience, and we're always working to improve our services so that you can enjoy even greater convenience.",
  },
];

function ownerPublicationError(error: unknown): string {
  const status = error && typeof error === 'object' && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  const code = apiErrorData(error)?.code;
  return status === 401 || status === 403 || code === 'OWNER_REQUIRED'
    ? 'Only an owner can publish the site snapshot. Your saved drafts are unchanged.'
    : apiErrorText(error, 'Unable to publish the site snapshot. Your saved drafts are unchanged.');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {}, null, 2);
  } catch {
    return '{}';
  }
}

export function contentValue(content: Record<string, unknown> | undefined, keys: string[], fallback = ''): string {
  if (!content) return fallback;
  for (const key of keys) {
    const value = content[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

function contentSections(content: Record<string, unknown> | undefined): Array<{ heading?: string; body: string }> {
  const sections = content?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    if (!section || typeof section !== 'object') return [];
    const item = section as Record<string, unknown>;
    const body = contentValue(item, ['body', 'description', 'text']);
    return body ? [{ heading: contentValue(item, ['heading', 'title']) || undefined, body }] : [];
  });
}

export function PublishedContentRenderer({
  content,
  fallbackTitle,
  className,
  mediaUrl,
}: {
  content?: Record<string, any>;
  fallbackTitle: string;
  className?: string;
  mediaUrl?: (objectPath: string) => string;
}) {
  const title = contentValue(content, ['title', 'headline', 'heading'], fallbackTitle);
  const intro = contentValue(content, ['subtitle', 'intro', 'description', 'body']);
  const mainBody = contentValue(content, ['body', 'content']);
  const sections = contentSections(content);

  const primaryLabel = content?.primaryButton?.label || contentValue(content, ['ctaLabel', 'callToActionLabel']);
  const primaryHref = content?.primaryButton?.href || contentValue(content, ['ctaHref', 'callToActionHref']);

  const secondaryLabel = content?.secondaryButton?.label;
  const secondaryHref = content?.secondaryButton?.href;

  const heroImagePath = content?.heroImage?.objectPath;
  const heroImageAlt = content?.heroImage?.altText || title;

  return (
    <article className={cn('published-content mx-auto w-full max-w-5xl px-6 py-16 md:px-8 lg:py-24', className)} data-testid="published-content">
      <div className={cn("grid gap-12", heroImagePath ? "lg:grid-cols-2 lg:items-center" : "")}>
        <header className="max-w-3xl">
          <span className="section-kicker">QUICKXCHANGE</span>
          <h1 className="mt-3 text-4xl font-marketing font-extrabold tracking-tight text-foreground md:text-6xl" data-testid="text-published-title">{title}</h1>
          {intro && <p className="mt-6 text-lg leading-relaxed text-muted-foreground" data-testid="text-published-intro">{intro}</p>}

          <div className="mt-8 flex flex-wrap gap-4">
            {primaryLabel && primaryHref && (
              /^https?:\/\//i.test(primaryHref) ? (
                <a className="button button-primary h-12 px-6 inline-flex" href={primaryHref} rel="noreferrer" target="_blank" data-testid="link-published-primary">
                  {primaryLabel} <ExternalLink size={15} />
                </a>
              ) : (
                <a className="button button-primary h-12 px-6 inline-flex" href={primaryHref} data-testid="link-published-primary">
                  {primaryLabel}
                </a>
              )
            )}
            {secondaryLabel && secondaryHref && (
              /^https?:\/\//i.test(secondaryHref) ? (
                <a className="button button-secondary h-12 px-6 inline-flex" href={secondaryHref} rel="noreferrer" target="_blank" data-testid="link-published-secondary">
                  {secondaryLabel} <ExternalLink size={15} />
                </a>
              ) : (
                <a className="button button-secondary h-12 px-6 inline-flex" href={secondaryHref} data-testid="link-published-secondary">
                  {secondaryLabel}
                </a>
              )
            )}
          </div>
        </header>

        {heroImagePath && (
          <div className="relative aspect-square md:aspect-[4/3] lg:aspect-auto lg:h-[480px] w-full overflow-hidden rounded-3xl border border-border bg-card/50 shadow-sm">
            <img src={mediaUrl?.(heroImagePath) ?? `${basePath}/api/storage/objects/site-page-media/${heroImagePath.split('/').pop()}`} alt={heroImageAlt} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}
      </div>

      {mainBody && sections.length === 0 && intro !== mainBody && (
        <div className="mt-16 max-w-3xl">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">{mainBody}</p>
        </div>
      )}

      {sections.length > 0 && (
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:gap-8">
          {sections.map((section, index) => (
            <section className="rounded-3xl border border-border bg-card p-8 shadow-sm relative overflow-hidden" key={`${section.heading || 'section'}-${index}`} data-testid={`card-published-section-${index}`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-[var(--qx-gradient)] opacity-70" />
              {section.heading && <h2 className="mb-4 text-2xl font-marketing font-bold text-foreground">{section.heading}</h2>}
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

function partnerLogoUrl(objectPath: string): string {
  const id = objectPath.split('/').pop();
  return id ? `${basePath}/api/storage/objects/partner-logos/${id}` : '';
}

function PublishSnapshotButton({ setNotice }: { setNotice: (notice: Notice) => void }) {
  const publish = usePublishSitePublication();
  const onPublish = () => publish.mutate(undefined, {
    onSuccess: (revision) => {
      setNotice({ kind: 'success', text: `Published site snapshot v${revision.version}.` });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPublishedSiteContentQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPublishedNavigationQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPublishedPartnerLogosQueryKey() }),
      ]);
    },
    onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Only an owner can publish the site snapshot.') }),
  });
  return <button type="button" className="button button-primary" disabled={publish.isPending} onClick={onPublish} data-testid="button-publish-site-section">{publish.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Publish</button>;
}

export function PartnerSlider({ logos }: { logos: PartnerLogo[] }) {
  const [manualPaused, setManualPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const paused = manualPaused || interactionPaused || reducedMotion;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  if (!logos.length) return null;
  const items = logos.map((logo) => (
    <li key={logo.id} className="partner-slide" data-testid={`partner-logo-${logo.id}`}>
      {logo.link ? (
        <a href={logo.link} target="_blank" rel="noreferrer" aria-label={logo.name}>
          <img src={partnerLogoUrl(logo.objectPath)} alt={logo.name} loading="lazy" />
        </a>
      ) : <img src={partnerLogoUrl(logo.objectPath)} alt={logo.name} loading="lazy" />}
    </li>
  ));
  return (
    <section className="partner-slider mx-auto w-full max-w-7xl px-6 py-12 md:px-8" aria-labelledby="partner-slider-title">
      <div className="mb-6 flex items-center justify-center gap-3">
        <h2 id="partner-slider-title" className="text-center text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Trusted partners</h2>
        <button type="button" className="button button-secondary h-8 px-2 text-xs" onClick={() => setManualPaused((value) => !value)} aria-label={paused ? 'Play partner logo slider' : 'Pause partner logo slider'} aria-pressed={paused} data-testid="button-partner-slider-toggle">
          {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          <span className="sr-only">{paused ? 'Play' : 'Pause'} partner logo slider</span>
        </button>
      </div>
      <div
        className={cn('partner-slider-viewport', paused && 'is-paused')}
        onMouseEnter={() => setInteractionPaused(true)}
        onMouseLeave={() => setInteractionPaused(false)}
        onFocus={() => setInteractionPaused(true)}
        onBlur={() => setInteractionPaused(false)}
        data-testid="partner-slider"
      >
        <ul className="partner-slider-track" aria-live="polite">{items}{logos.map((logo) => <li key={`duplicate-${logo.id}`} className="partner-slide" aria-hidden="true"><img src={partnerLogoUrl(logo.objectPath)} alt="" /></li>)}</ul>
      </div>
    </section>
  );
}

function DraftEditor() {
  const [pageKey, setPageKey] = useState<SitePageKey>('home');
  const page = useGetAdminSiteContent(pageKey, { query: { queryKey: getGetAdminSiteContentQueryKey(pageKey), staleTime: 0 } });
  const save = useSaveAdminSitePage();
  const publish = usePublishAdminSitePage();
  const upload = useRequestSitePageMediaUpload();
  const [json, setJson] = useState('{}');
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [localMedia, setLocalMedia] = useState<{ objectPath: string; url: string } | null>(null);
  const [storedMedia, setStoredMedia] = useState<{ objectPath: string; url: string } | null>(null);
  const dirtyRef = useRef(false);
  const loadedPageRef = useRef<SitePageKey | null>(null);

  useEffect(() => {
    if (loadedPageRef.current === pageKey && dirtyRef.current) return;
    setJson(safeJson(page.data?.draft?.content ?? page.data?.published?.content ?? {}));
    setPreview(false);
    dirtyRef.current = false;
    loadedPageRef.current = pageKey;
  }, [page.data, pageKey]);

  useEffect(() => () => {
    if (localMedia) URL.revokeObjectURL(localMedia.url);
  }, [localMedia]);

  const { parsedContent, jsonValid } = useMemo(() => {
    try {
      const parsed = JSON.parse(json);
      return {
        parsedContent: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {},
        jsonValid: Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)),
      };
    } catch {
      return { parsedContent: {}, jsonValid: false };
    }
  }, [json]);
  const pageDefinition = EDITABLE_PUBLIC_PAGES.find((page) => page.key === pageKey);
  const pageDefaults = pageDefinition as { defaultHeader?: boolean; defaultFooter?: boolean } | undefined;
  const isWidgetExchangeInformation = pageKey === WIDGET_EXCHANGE_INFORMATION_KEY;
  const heroObjectPath = typeof parsedContent.heroImage?.objectPath === 'string' ? parsedContent.heroImage.objectPath : '';

  useEffect(() => {
    if (!preview || !heroObjectPath || localMedia?.objectPath === heroObjectPath) {
      setStoredMedia(null);
      return;
    }
    let disposed = false;
    let objectUrl: string | null = null;
    const id = heroObjectPath.split('/').pop();
    if (!id) return;
    void previewAdminSitePageMedia(pageKey, id).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setStoredMedia({ objectPath: heroObjectPath, url: objectUrl });
    }).catch(() => setStoredMedia(null));
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [heroObjectPath, localMedia?.objectPath, pageKey, preview]);

  const setEditedJson = (value: string) => {
    dirtyRef.current = true;
    setJson(value);
  };

  const updateField = (key: string, value: any) => {
    dirtyRef.current = true;
    setJson((current) => {
      try {
        const parsed = JSON.parse(current);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return current;
        return safeJson({ ...parsed, [key]: value });
      } catch {
        return current;
      }
    });
  };

  const submit = (publishAfterSave: boolean) => {
    setNotice(null);
    let content: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Content must be a JSON object.');
      content = parsed as Record<string, unknown>;
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Enter valid JSON content.' });
      return;
    }
    save.mutate({ pageKey, data: { content } }, {
      onSuccess: () => {
        dirtyRef.current = false;
        void queryClient.invalidateQueries({ queryKey: getGetAdminSiteContentQueryKey(pageKey) });
        void queryClient.invalidateQueries({ queryKey: getGetPublishedSiteContentQueryKey() });
        if (!publishAfterSave) {
          setNotice({ kind: 'success', text: 'Draft saved.' });
          return;
        }
        publish.mutate({ pageKey }, {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: getGetAdminSiteContentQueryKey(pageKey) });
            void queryClient.invalidateQueries({ queryKey: getGetPublishedSiteContentQueryKey() });
            setNotice({ kind: 'success', text: `${PAGE_LABELS[pageKey]} published.` });
          },
          onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Only an owner can publish content.') }),
        });
      },
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save draft.') }),
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = new Set(['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']);
    if (!allowedTypes.has(file.type)) {
      setNotice({ kind: 'error', text: 'Choose an SVG, PNG, WebP, JPG, or JPEG image.' });
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ kind: 'error', text: 'Images must be 5 MB or smaller.' });
      e.target.value = '';
      return;
    }
    setNotice(null);
    setUploadingImage(true);
    try {
      const intent = await upload.mutateAsync({ data: { contentType: file.type as ImageUploadInputContentType } });
      const response = await fetch(intent.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
      dirtyRef.current = true;
      setJson((current) => {
        try {
          const content = JSON.parse(current) as Record<string, any>;
          return safeJson({
            ...content,
            heroImage: {
              ...(content.heroImage && typeof content.heroImage === 'object' ? content.heroImage : {}),
              objectPath: intent.objectPath,
            },
          });
        } catch {
          setNotice({ kind: 'error', text: 'The image uploaded, but the current JSON is invalid. Fix the JSON and choose the image again.' });
          return current;
        }
      });
      setLocalMedia({ objectPath: intent.objectPath, url: URL.createObjectURL(file) });
    } catch (error) {
      setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to upload image.') });
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <section className="space-y-6" data-testid="site-content-editor">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Editable public pages">
        {SITE_PAGE_KEYS.map((key) => <button key={key} type="button" role="tab" aria-selected={pageKey === key} className={cn('button h-9 px-3 text-xs', pageKey === key ? 'button-primary' : 'button-secondary')} onClick={() => {
          if (key === pageKey) return;
          if (dirtyRef.current && !window.confirm('Discard unsaved page changes?')) return;
          loadedPageRef.current = null;
          dirtyRef.current = false;
          setLocalMedia(null);
          setPageKey(key);
        }} data-testid={`tab-site-page-${key}`}>{PAGE_LABELS[key]}</button>)}
      </div>
      {page.isLoading ? <LoadingBlock rows={8} /> : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{PAGE_LABELS[pageKey]} draft</h2>
                <div className="flex gap-2 mt-2">
                  <button type="button" className={cn('text-xs font-semibold px-2 py-1 rounded-md transition-colors', mode === 'visual' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} onClick={() => {
                    if (!jsonValid) {
                      setNotice({ kind: 'error', text: 'Fix the JSON before returning to the Visual Editor.' });
                      return;
                    }
                    setMode('visual');
                  }}>Visual Editor</button>
                  <button type="button" className={cn('text-xs font-semibold px-2 py-1 rounded-md transition-colors', mode === 'json' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} onClick={() => setMode('json')}>Advanced JSON</button>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{page.data?.published ? `Published v${page.data.published.revision}` : 'Not published'}</span>
            </div>

            {mode === 'json' ? (
              <textarea className="min-h-[620px] w-full rounded-xl border border-border bg-background p-4 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={json} onChange={(event) => setEditedJson(event.target.value)} aria-label={`${PAGE_LABELS[pageKey]} draft JSON`} data-testid="input-site-content-json" spellCheck={false} />
            ) : (
              <div className="space-y-6 max-h-[620px] overflow-y-auto pr-2 pb-4">
                {isWidgetExchangeInformation ? (
                  <div className="space-y-4" data-testid="widget-exchange-information-editor">
                    <div className="rounded-xl border border-border bg-muted/10 p-4">
                      <h3 className="font-bold text-sm">Widget Exchange Information</h3>
                      <p className="mt-1 text-xs text-muted-foreground">This single card appears directly below the public Swap/Convert widget.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm font-semibold">
                        <input type="checkbox" checked={parsedContent.visible !== false} onChange={(e) => updateField('visible', e.target.checked)} data-testid="input-widget-info-visible" />
                        Show card
                      </label>
                      <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm font-semibold">
                        <input type="checkbox" checked={parsedContent.showIcon !== false} onChange={(e) => updateField('showIcon', e.target.checked)} data-testid="input-widget-info-icon" />
                        Show icon
                      </label>
                      <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm font-semibold">
                        <input type="checkbox" checked={parsedContent.glow !== false} onChange={(e) => updateField('glow', e.target.checked)} data-testid="input-widget-info-glow" />
                        Glow
                      </label>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="widget-info-title">Optional title</label>
                      <input id="widget-info-title" className="admin-input" placeholder="Exchange Information" value={typeof parsedContent.title === 'string' ? parsedContent.title : ''} onChange={(e) => updateField('title', e.target.value)} data-testid="input-widget-info-title" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="widget-info-text">Information text</label>
                      <textarea id="widget-info-text" className="admin-input min-h-48 resize-y" value={typeof parsedContent.text === 'string' ? parsedContent.text : ''} onChange={(e) => updateField('text', e.target.value)} data-testid="input-widget-info-text" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="widget-info-size">Text size</label>
                        <select id="widget-info-size" className="admin-input" value={typeof parsedContent.textSize === 'string' ? parsedContent.textSize : 'small'} onChange={(e) => updateField('textSize', e.target.value)} data-testid="input-widget-info-size">
                          <option value="small">Small</option>
                          <option value="medium">Medium</option>
                          <option value="large">Large</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="widget-info-alignment">Text alignment</label>
                        <select id="widget-info-alignment" className="admin-input" value={typeof parsedContent.textAlign === 'string' ? parsedContent.textAlign : 'left'} onChange={(e) => updateField('textAlign', e.target.value)} data-testid="input-widget-info-alignment">
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-sm font-semibold p-3 border border-border rounded-lg bg-muted/30">
                     <input type="checkbox" checked={parsedContent.visibility?.enabled ?? true} onChange={(e) => updateField('visibility', { ...parsedContent.visibility, enabled: e.target.checked })} data-testid="input-page-visible" />
                    Page is Visible to Public
                  </label>

                  <div className="grid gap-4 bg-muted/10 p-4 rounded-xl border border-border">
                    <h3 className="font-bold text-sm">SEO & Navigation</h3>
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

                  <div className="grid gap-4 bg-muted/10 p-4 rounded-xl border border-border">
                    <h3 className="font-bold text-sm">Hero Section</h3>
                    <input className="admin-input" placeholder="Headline / Title" value={parsedContent.title || parsedContent.headline || parsedContent.heading || ''} onChange={(e) => {
                      const updated: Record<string, any> = { ...parsedContent, title: e.target.value };
                      delete updated['headline'];
                      delete updated['heading'];
                      setEditedJson(safeJson(updated));
                    }} />
                    <textarea className="admin-input h-24" placeholder="Subtitle / Intro" value={parsedContent.subtitle || parsedContent.intro || parsedContent.description || ''} onChange={(e) => {
                      const updated: Record<string, any> = { ...parsedContent, subtitle: e.target.value };
                      delete updated['intro'];
                      delete updated['description'];
                      setEditedJson(safeJson(updated));
                    }} data-testid="input-page-subtitle" />
                    <textarea className="admin-input h-28" placeholder="Main page text" value={parsedContent.body || parsedContent.content || ''} onChange={(e) => {
                      const updated: Record<string, any> = { ...parsedContent, body: e.target.value };
                      delete updated['content'];
                      setEditedJson(safeJson(updated));
                    }} data-testid="input-page-body" />

                    <div className="space-y-2">
                      <span className="text-sm font-semibold">Hero Media</span>
                      <div className="flex items-center gap-3">
                        <label className="button button-secondary cursor-pointer shrink-0">
                          {uploadingImage ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                          Upload Image
                          <input type="file" className="sr-only" accept=".svg,.png,.webp,.jpg,.jpeg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleImageUpload} disabled={uploadingImage} data-testid="input-page-hero-media" />
                        </label>
                        <input className="admin-input flex-1" placeholder="Image Object Path or URL" value={parsedContent.heroImage?.objectPath || ''} onChange={(e) => updateField('heroImage', { ...parsedContent.heroImage, objectPath: e.target.value })} />
                      </div>
                      <input className="admin-input w-full mt-2" placeholder="Image Alt Text" value={parsedContent.heroImage?.altText || ''} onChange={(e) => updateField('heroImage', { ...parsedContent.heroImage, altText: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Primary Button</span>
                        <input className="admin-input text-sm h-9" placeholder="Label (e.g. Get Started)" value={parsedContent.primaryButton?.label || parsedContent.ctaLabel || ''} onChange={(e) => {
                          const updated: Record<string, any> = { ...parsedContent, primaryButton: { ...parsedContent.primaryButton, label: e.target.value } };
                          delete updated['ctaLabel'];
                          setEditedJson(safeJson(updated));
                        }} />
                        <input className="admin-input text-sm h-9" placeholder="URL (e.g. /convert)" value={parsedContent.primaryButton?.href || parsedContent.ctaHref || ''} onChange={(e) => {
                          const updated: Record<string, any> = { ...parsedContent, primaryButton: { ...parsedContent.primaryButton, href: e.target.value } };
                          delete updated['ctaHref'];
                          setEditedJson(safeJson(updated));
                        }} />
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Secondary Button</span>
                        <input className="admin-input text-sm h-9" placeholder="Label (e.g. Learn More)" value={parsedContent.secondaryButton?.label || ''} onChange={(e) => updateField('secondaryButton', { ...parsedContent.secondaryButton, label: e.target.value })} />
                        <input className="admin-input text-sm h-9" placeholder="URL" value={parsedContent.secondaryButton?.href || ''} onChange={(e) => updateField('secondaryButton', { ...parsedContent.secondaryButton, href: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  {pageKey === 'affiliate-program' && (
                    <div className="grid gap-4 bg-muted/10 p-4 rounded-xl border border-border" data-testid="affiliate-how-it-works-editor">
                      <div>
                        <h3 className="font-bold text-sm">How It Works</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Edit the three numbered steps shown on the public referral-program page.</p>
                      </div>
                      <input
                        className="admin-input"
                        placeholder="Section title"
                        value={parsedContent.howItWorksTitle || 'How Does It Work?'}
                        onChange={(e) => updateField('howItWorksTitle', e.target.value)}
                        data-testid="input-affiliate-how-it-works-title"
                      />
                      {[
                        {
                          title: 'Ask people to Join',
                          description: 'Promote your affiliate link or code through social media, friends, communities, and groups. You can find your unique link or code in your affiliate dashboard.',
                        },
                        {
                          title: 'Engage to Exchange',
                          description: 'Promote QuickXchange among your affiliates and teach them how to exchange between payment methods. Earn 30% of fees from their orders.',
                        },
                        {
                          title: 'Earn revenue',
                          description: 'Monitor your affiliates’ activity through your affiliate dashboard and watch your profits increase automatically. You can withdraw profits to your wallet once your profits reach 30$ or more.',
                        },
                      ].map((fallback, index) => {
                        const steps = Array.isArray(parsedContent.howItWorksSteps) ? parsedContent.howItWorksSteps : [];
                        const step = steps[index] && typeof steps[index] === 'object' ? steps[index] : {};
                        const updateStep = (patch: Record<string, string>) => {
                          const next = [0, 1, 2].map((stepIndex) => {
                            const existing = steps[stepIndex] && typeof steps[stepIndex] === 'object' ? steps[stepIndex] : {};
                            const defaults = [
                              {
                                title: 'Ask people to Join',
                                description: 'Promote your affiliate link or code through social media, friends, communities, and groups. You can find your unique link or code in your affiliate dashboard.',
                              },
                              {
                                title: 'Engage to Exchange',
                                description: 'Promote QuickXchange among your affiliates and teach them how to exchange between payment methods. Earn 30% of fees from their orders.',
                              },
                              {
                                title: 'Earn revenue',
                                description: 'Monitor your affiliates’ activity through your affiliate dashboard and watch your profits increase automatically. You can withdraw profits to your wallet once your profits reach 30$ or more.',
                              },
                            ][stepIndex];
                            return { ...defaults, ...existing, ...(stepIndex === index ? patch : {}) };
                          });
                          updateField('howItWorksSteps', next);
                        };
                        return (
                          <div className="space-y-3 rounded-lg border border-border bg-background p-4" key={index}>
                            <span className="text-xs font-bold uppercase tracking-wider text-primary">Step {String(index + 1).padStart(2, '0')}</span>
                            <input
                              className="admin-input font-semibold"
                              placeholder={`Step ${index + 1} title`}
                              value={step.title || fallback.title}
                              onChange={(e) => updateStep({ title: e.target.value })}
                              data-testid={`input-affiliate-step-${index + 1}-title`}
                            />
                            <textarea
                              className="admin-input h-28"
                              placeholder={`Step ${index + 1} description`}
                              value={step.description || fallback.description}
                              onChange={(e) => updateStep({ description: e.target.value })}
                              data-testid={`input-affiliate-step-${index + 1}-description`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {pageKey === 'about-us' && (
                    <div className="grid gap-4 bg-muted/10 p-4 rounded-xl border border-border" data-testid="about-difference-editor">
                      <div>
                        <h3 className="font-bold text-sm">What Makes QuickXchange Different</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Edit the four numbered points shown on the public About Us page.</p>
                      </div>
                      <input
                        className="admin-input"
                        placeholder="Section title"
                        value={parsedContent.differenceTitle || 'What makes QuickXchange different?'}
                        onChange={(e) => updateField('differenceTitle', e.target.value)}
                        data-testid="input-about-difference-title"
                      />
                      {ABOUT_DIFFERENCE_POINTS.map((fallback, index) => {
                        const points = Array.isArray(parsedContent.differencePoints) ? parsedContent.differencePoints : [];
                        const point = points[index] && typeof points[index] === 'object' ? points[index] : {};
                        const updatePoint = (patch: Record<string, string>) => {
                          const next = ABOUT_DIFFERENCE_POINTS.map((defaults, pointIndex) => {
                            const existing = points[pointIndex] && typeof points[pointIndex] === 'object' ? points[pointIndex] : {};
                            return { ...defaults, ...existing, ...(pointIndex === index ? patch : {}) };
                          });
                          updateField('differencePoints', next);
                        };
                        return (
                          <div className="space-y-3 rounded-lg border border-border bg-background p-4" key={index}>
                            <span className="text-xs font-bold uppercase tracking-wider text-primary">Point {String(index + 1).padStart(2, '0')}</span>
                            <input
                              className="admin-input font-semibold"
                              placeholder={`Point ${index + 1} title`}
                              value={point.title || fallback.title}
                              onChange={(e) => updatePoint({ title: e.target.value })}
                              data-testid={`input-about-point-${index + 1}-title`}
                            />
                            <textarea
                              className="admin-input h-36"
                              placeholder={`Point ${index + 1} description`}
                              value={point.description || fallback.description}
                              onChange={(e) => updatePoint({ description: e.target.value })}
                              data-testid={`input-about-point-${index + 1}-description`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(pageKey === 'privacy-policy' || pageKey === 'terms-conditions') && (() => {
                    const defaults = pageKey === 'privacy-policy' ? PRIVACY_NOTICE_SECTIONS : TERMS_NOTICE_SECTIONS;
                    const legalSections = Array.isArray(parsedContent.legalSections) ? parsedContent.legalSections : [];
                    const displayedSections = defaults.map((fallback, index) => {
                      const existing = legalSections[index];
                      return existing && typeof existing === 'object' ? { ...fallback, ...existing } : fallback;
                    });
                    const updateLegalSection = (index: number, patch: Record<string, string>) => {
                      updateField('legalSections', displayedSections.map((section, sectionIndex) => (
                        sectionIndex === index ? { ...section, ...patch } : section
                      )));
                    };
                    return (
                      <div className="grid gap-4 bg-muted/10 p-4 rounded-xl border border-border" data-testid={`${pageKey}-legal-content-editor`}>
                        <div>
                          <h3 className="font-bold text-sm">{pageKey === 'privacy-policy' ? 'Privacy Policy Content' : 'Terms & Conditions Content'}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">Edit the structured sections shown on this public legal page.</p>
                        </div>
                        {displayedSections.map((section, index) => (
                          <div className="space-y-3 rounded-lg border border-border bg-background p-4" key={index}>
                            <span className="text-xs font-bold uppercase tracking-wider text-primary">Section {String(index + 1).padStart(2, '0')}</span>
                            <input
                              className="admin-input font-semibold"
                              value={section.heading}
                              onChange={(e) => updateLegalSection(index, { heading: e.target.value })}
                              data-testid={`input-${pageKey}-legal-section-${index + 1}-heading`}
                            />
                            <textarea
                              className="admin-input min-h-36"
                              value={section.body}
                              onChange={(e) => updateLegalSection(index, { body: e.target.value })}
                              data-testid={`input-${pageKey}-legal-section-${index + 1}-body`}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="grid gap-4 bg-muted/10 p-4 rounded-xl border border-border">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm">Content Sections</h3>
                      <button type="button" className="button button-secondary h-7 px-2 text-xs" onClick={() => updateField('sections', [...(parsedContent.sections || []), { heading: '', body: '' }])}><Plus size={13} /> Add Section</button>
                    </div>
                    {Array.isArray(parsedContent.sections) && parsedContent.sections.map((section: any, idx: number) => (
                      <div key={idx} className="relative p-3 border border-border rounded-lg bg-background space-y-3">
                        <button type="button" className="absolute top-2 right-2 text-muted-foreground hover:text-destructive" onClick={() => updateField('sections', parsedContent.sections.filter((_: any, i: number) => i !== idx))}><X size={15} /></button>
                        <input className="admin-input font-bold" placeholder="Section Heading" value={section.heading || section.title || ''} onChange={(e) => {
                          const updated: Record<string, any>[] = [...parsedContent.sections];
                          updated[idx] = { ...updated[idx], heading: e.target.value };
                          delete updated[idx]['title'];
                          updateField('sections', updated);
                        }} />
                        <textarea className="admin-input h-28" placeholder="Section Body" value={section.body || section.description || section.text || ''} onChange={(e) => {
                          const updated: Record<string, any>[] = [...parsedContent.sections];
                          updated[idx] = { ...updated[idx], body: e.target.value };
                          delete updated[idx]['description'];
                          delete updated[idx]['text'];
                          updateField('sections', updated);
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
                )}
              </div>
            )}

            {notice && <div className="mt-4"><InlineNotice kind={notice.kind}>{notice.text}</InlineNotice></div>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="button button-secondary" onClick={() => setPreview((value) => !value)} data-testid="button-preview-site-content"><Eye size={15} /> {preview ? 'Close preview' : 'Preview draft'}</button>
              <button type="button" className="button button-secondary" disabled={save.isPending} onClick={() => submit(false)} data-testid="button-save-site-content"><Save size={15} /> Save draft</button>
              <button type="button" className="button button-primary" disabled={save.isPending || publish.isPending} onClick={() => submit(true)} data-testid="button-publish-site-content">{save.isPending || publish.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Publish</button>
            </div>
          </div>
          {preview ? (
            <div className="panel overflow-hidden border border-border bg-background p-0">
               <LivePreviewFrame draftState={{
                 pageKey,
                  content: parsedContent,
                  assetUrls: localMedia
                    ? { [localMedia.objectPath]: localMedia.url }
                    : storedMedia
                      ? { [storedMedia.objectPath]: storedMedia.url }
                      : undefined,
               }} />
            </div>
          ) : (
            <div className="panel flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground"><Eye size={18} className="mr-2" /> Preview stays private until an owner publishes it.</div>
          )}
        </div>
      )}
    </section>
  );
}


function NavigationEditor() {
  const query = useListAdminNavigation({ query: { queryKey: getListAdminNavigationQueryKey(), staleTime: 0 } });
  const save = useSaveAdminNavigation();
  const remove = useRemoveAdminNavigation();
  const [editing, setEditing] = useState<SiteNavLinkInput>({ label: '', href: '/', enabled: true, header: true, footer: true, widget: false });
  const [notice, setNotice] = useState<Notice | null>(null);
  const persist = () => {
    if (!editing.label.trim() || !editing.href.trim()) { setNotice({ kind: 'error', text: 'Label and URL are required.' }); return; }
    save.mutate({ data: { ...editing, label: editing.label.trim(), href: editing.href.trim() } }, {
      onSuccess: () => { setNotice({ kind: 'success', text: 'Navigation draft saved. The public site is unchanged until an owner publishes the site snapshot.' }); setEditing({ label: '', href: '/', enabled: true, header: true, footer: true, widget: false }); void queryClient.invalidateQueries({ queryKey: getListAdminNavigationQueryKey() }); },
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save navigation link.') }),
    });
  };
  const [preview, setPreview] = useState(false);
  const previewNavigation = useMemo(() => {
    const links = [...(query.data ?? [])];
    if (editing.id) {
      const index = links.findIndex((link) => link.id === editing.id);
      if (index >= 0) links[index] = { ...links[index], ...editing, id: editing.id };
    } else if (editing.label.trim() && editing.href.trim()) {
      links.push({ ...editing, id: 'preview-navigation-link' });
    }
    return links.sort(automaticNavigationOrder);
  }, [editing, query.data]);

  return <section className="space-y-5" data-testid="site-navigation-editor">
    <div className="panel grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6">
      <input className="admin-input lg:col-span-2" placeholder="Label" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} data-testid="input-navigation-label" />
      <input className="admin-input lg:col-span-2" placeholder="URL" value={editing.href} onChange={(e) => setEditing({ ...editing, href: e.target.value })} data-testid="input-navigation-href" />
      <button type="button" className="button button-primary" onClick={persist} disabled={save.isPending} data-testid="button-save-navigation"><Save size={15} /> Save draft</button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} data-testid="input-navigation-enabled" /> Enabled</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.header} onChange={(e) => setEditing({ ...editing, header: e.target.checked })} data-testid="input-navigation-header" /> Header</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.footer} onChange={(e) => setEditing({ ...editing, footer: e.target.checked })} data-testid="input-navigation-footer" /> Footer</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.widget} onChange={(e) => setEditing({ ...editing, widget: e.target.checked })} data-testid="input-navigation-widget" /> Widget menu</label>
      {notice && <div className="sm:col-span-2 lg:col-span-6"><InlineNotice kind={notice.kind}>{notice.text}</InlineNotice></div>}
      <div className="sm:col-span-2 lg:col-span-6 mt-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button button-secondary" onClick={() => setPreview((value) => !value)}><Eye size={15} /> {preview ? 'Close preview' : 'Preview draft'}</button>
          <PublishSnapshotButton setNotice={setNotice} />
        </div>
      </div>
    </div>
    {preview && (
      <div className="panel p-0 h-[600px]">
        <LivePreviewFrame draftState={{
          pageKey: 'home',
           navigation: previewNavigation,
        }} />
      </div>
    )}
    <div className="panel divide-y divide-border overflow-hidden">{query.isLoading ? <LoadingBlock rows={4} /> : [...(query.data ?? [])].sort(automaticNavigationOrder).map((link) => <div className="flex flex-wrap items-center gap-3 p-4" key={link.id} data-testid={`row-navigation-${link.id}`}><span className="min-w-[130px] flex-1 font-semibold">{link.label}</span><code className="min-w-[180px] flex-[2] text-xs text-muted-foreground">{link.href}</code><span className="text-xs text-muted-foreground">{[link.header && 'header', link.footer && 'footer', link.widget && 'widget', link.enabled && 'enabled'].filter(Boolean).join(' · ') || 'disabled'}</span><button type="button" className="button button-secondary h-8 px-2 text-xs" onClick={() => setEditing(link)} data-testid={`button-edit-navigation-${link.id}`}>Edit</button><button type="button" className="button button-secondary h-8 px-2 text-xs text-destructive" onClick={() => remove.mutate({ id: link.id }, { onSuccess: () => { setNotice({ kind: 'success', text: 'Navigation removal saved as a draft. Publish the site snapshot to make it public.' }); void queryClient.invalidateQueries({ queryKey: getListAdminNavigationQueryKey() }); }, onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to remove navigation draft.') }) })} data-testid={`button-remove-navigation-${link.id}`}><Trash2 size={14} /></button></div>)}</div>
  </section>;
}

function AdminPartnerLogoPreview({ logo }: { logo: PartnerLogo }) {
  const preview = usePreviewAdminPartnerLogo(logo.id, {
    query: { queryKey: getPreviewAdminPartnerLogoQueryKey(logo.id), staleTime: 0 },
  });
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!(preview.data instanceof Blob)) {
      setSrc(null);
      return;
    }
    const objectUrl = URL.createObjectURL(preview.data);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview.data]);

  return (
    <img
      src={src || partnerLogoUrl(logo.objectPath)}
      alt={logo.name}
      className="max-h-full max-w-full object-contain"
      data-testid={`img-admin-partner-logo-preview-${logo.id}`}
    />
  );
}

function PartnerLogosEditor() {
  const query = useListAdminPartnerLogos({ query: { queryKey: getListAdminPartnerLogosQueryKey(), staleTime: 0 } });
  const upload = useRequestPartnerLogoUpload();
  const create = useCreateAdminPartnerLogo();
  const update = useUpdateAdminPartnerLogo();
  const remove = useRemoveAdminPartnerLogo();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editing, setEditing] = useState<PartnerLogo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [storedPreviewUrls, setStoredPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!preview || !query.data?.length) {
      setStoredPreviewUrls({});
      return;
    }
    let disposed = false;
    const objectUrls: string[] = [];
    void Promise.all(query.data.map(async (logo) => {
      try {
        const blob = await previewAdminPartnerLogo(logo.id);
        if (disposed) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        return [logo.objectPath, url] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!disposed) setStoredPreviewUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    });
    return () => {
      disposed = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [preview, query.data]);

  const previewLogos = useMemo(() => {
    const logos = [...(query.data ?? [])];
    if (editing) {
      const index = logos.findIndex((logo) => logo.id === editing.id);
      if (index >= 0) logos[index] = editing;
    }
    if (file && filePreviewUrl) {
      logos.push({
        id: 'preview-partner-logo',
        name: file.name.replace(/\.[^.]+$/, ''),
        objectPath: 'preview-partner-logo',
        link: null,
        enabled: true,
        createdAt: new Date(0).toISOString(),
      });
    }
    return logos.sort(automaticNameOrder);
  }, [editing, file, filePreviewUrl, query.data]);

  const saveEdited = (logo: PartnerLogo, patch: Partial<PartnerLogo>) => update.mutate({ id: logo.id, data: patch }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListAdminPartnerLogosQueryKey() }); void queryClient.invalidateQueries({ queryKey: getPreviewAdminPartnerLogoQueryKey(logo.id) }); setEditing(null); setNotice({ kind: 'success', text: 'Partner logo draft saved. Publish the site snapshot to make it public.' }); }, onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to update logo draft.') }) });
  const addLogo = async () => {
    if (!file) return;
    setNotice(null);
    try {
      const intent = await upload.mutateAsync({ data: { contentType: file.type as ImageUploadInputContentType } });
      const response = await fetch(intent.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
      await create.mutateAsync({ data: { name: file.name.replace(/\.[^.]+$/, ''), objectPath: intent.objectPath, link: null, enabled: true } });
      setFile(null); setNotice({ kind: 'success', text: 'Partner logo draft uploaded. Publish the site snapshot to make it public.' }); void queryClient.invalidateQueries({ queryKey: getListAdminPartnerLogosQueryKey() });
    } catch (error) { setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to upload partner logo.') }); }
  };
  return <section className="space-y-5" data-testid="partner-logos-editor">
    <div className="panel flex flex-wrap items-center gap-3 p-5">
      <label className="button button-secondary cursor-pointer"><ImagePlus size={15} /> Choose logo<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="input-partner-logo-file" /></label>
      <span className="flex-1 text-sm text-muted-foreground">{file?.name || 'PNG, JPEG, WebP, or SVG'}</span>
      <button type="button" className="button button-primary" disabled={!file || upload.isPending || create.isPending} onClick={() => void addLogo()} data-testid="button-upload-partner-logo"><Save size={15} /> Save draft</button>
      <button type="button" className="button button-secondary" onClick={() => setPreview(p => !p)}><Eye size={15} /> {preview ? 'Close preview' : 'Preview draft'}</button>
      <PublishSnapshotButton setNotice={setNotice} />
      {notice && <div className="basis-full"><InlineNotice kind={notice.kind}>{notice.text}</InlineNotice></div>}
    </div>
    {preview && (
      <div className="panel p-0 h-[600px]">
        <LivePreviewFrame draftState={{
          pageKey: 'home',
           partnerLogos: previewLogos,
           assetUrls: {
             ...storedPreviewUrls,
             ...(filePreviewUrl ? { 'preview-partner-logo': filePreviewUrl } : {}),
           },
        }} />
      </div>
    )}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...(query.data ?? [])].sort(automaticNameOrder).map((logo) => <div className="panel overflow-hidden p-4" key={logo.id} data-testid={`card-partner-logo-${logo.id}`}><div className="flex h-24 items-center justify-center rounded-lg bg-muted p-3"><AdminPartnerLogoPreview logo={logo} /></div>{editing?.id === logo.id ? <div className="mt-3 space-y-2"><input className="admin-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Partner name" /><input className="admin-input" value={editing.link ?? ''} onChange={(e) => setEditing({ ...editing, link: e.target.value || null })} placeholder="https://partner.example" aria-label="Partner URL" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} /> Enabled</label><div className="flex gap-2"><button type="button" className="button button-primary h-8 px-2 text-xs" onClick={() => saveEdited(logo, { name: editing.name, link: editing.link, enabled: editing.enabled })} data-testid={`button-save-partner-logo-${logo.id}`}><Save size={13} /> Save</button><button type="button" className="button button-secondary h-8 px-2 text-xs" onClick={() => setEditing(null)}><X size={13} /></button></div></div> : <div className="mt-3 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-semibold">{logo.name}</span><button type="button" className="button button-secondary h-8 px-2 text-xs" onClick={() => setEditing(logo)} data-testid={`button-edit-partner-logo-${logo.id}`}>Edit</button><button type="button" className="button button-secondary h-8 px-2 text-xs text-destructive" onClick={() => remove.mutate({ id: logo.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListAdminPartnerLogosQueryKey() }); setNotice({ kind: 'success', text: 'Partner logo removal saved as a draft. Publish the site snapshot to make it public.' }); }, onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to remove logo draft.') }) })} data-testid={`button-remove-partner-logo-${logo.id}`}><Trash2 size={13} /></button></div>}</div>)}</div>
  </section>;
}

function AdminSocialTrustIconPreview({ item }: { item: SocialTrustItem }) {
  const preview = usePreviewAdminSocialTrustIcon(item.id, {
    query: { queryKey: getPreviewAdminSocialTrustIconQueryKey(item.id), staleTime: 0, enabled: Boolean(item.objectPath) },
  });
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!(preview.data instanceof Blob)) {
      setSrc(null);
      return;
    }
    const objectUrl = URL.createObjectURL(preview.data);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview.data]);

  if (!item.objectPath && !src) return <span className="text-lg font-bold text-muted-foreground">{item.name.slice(0, 2).toUpperCase()}</span>;
  return <img src={src || `${basePath}/api/storage/objects/social-trust-icons/${item.objectPath?.split('/').pop()}`} alt={item.name} className="max-h-full max-w-full object-contain" />;
}

function SocialIconAppearancePreview({
  items,
  appearance,
  pendingName,
  pendingImage,
}: {
  items: SocialTrustItem[];
  appearance: SocialIconAppearance;
  pendingName: string;
  pendingImage: string | null;
}) {
  const radius = appearance.radiusMode === 'circle' ? 999 : appearance.radiusMode === 'rounded' ? 8 : 0;
  const circleSize = appearance.circleSize ?? 36;
  const logoPixels = Math.min(appearance.iconSize ?? 16, circleSize * ((appearance.logoSize ?? 72) / 100));
  const previewItems = items.filter((item) => item.group === 'social' && item.enabled).slice(0, 8);
  const renderIcons = (theme: 'light' | 'dark') => (
    <div className={cn('flex min-h-20 flex-wrap items-center gap-2 rounded-xl border p-4', theme === 'dark' ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white')}>
      {[...previewItems, ...(pendingName.trim() ? [{ id: 'pending', name: pendingName, objectPath: null } as SocialTrustItem] : [])].map((item) => (
        <span
          key={`${theme}-${item.id}`}
          className="flex shrink-0 items-center justify-center overflow-hidden font-bold"
          style={{
            width: circleSize,
            height: circleSize,
            borderWidth: appearance.borderThickness ?? 1,
            borderStyle: 'solid',
            borderColor: appearance.borderColor,
            borderRadius: radius,
            backgroundColor: appearance.backgroundColor,
            boxShadow: `0 0 ${(appearance.glowIntensity ?? 0) * 0.18}px ${appearance.glowColor}`,
          }}
          aria-label={`Preview ${item.name}`}
        >
          <span className="flex items-center justify-center" style={{ width: logoPixels, height: logoPixels, opacity: (appearance.iconOpacity ?? 100) / 100 }}>
            {item.id === 'pending' && pendingImage
              ? <img src={pendingImage} alt="" className="h-full w-full object-contain" />
              : item.id === 'pending'
                ? <span style={{ fontSize: Math.max(8, (appearance.iconSize ?? 16) * 0.7) }}>{item.name.slice(0, 2).toUpperCase()}</span>
                : <AdminSocialTrustIconPreview item={item} />}
          </span>
        </span>
      ))}
      {!previewItems.length && !pendingName.trim() && <span className={cn('text-xs', theme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Add a social media item to preview its icon.</span>}
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="social-icon-live-preview">
      <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Light Mode</p>{renderIcons('light')}</div>
      <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Dark Mode</p>{renderIcons('dark')}</div>
    </div>
  );
}

function SocialTrustEditor() {
  const query = useGetAdminSocialTrust({ query: { queryKey: getGetAdminSocialTrustQueryKey(), staleTime: 0 } });
  const updateTitles = useUpdateAdminSocialTrustTitles();
  const updateSocialMedia = useUpdateAdminSocialMedia();
  const upload = useRequestSocialTrustIconUpload();
  const create = useCreateAdminSocialTrustItem();
  const update = useUpdateAdminSocialTrustItem();
  const remove = useRemoveAdminSocialTrustItem();

  const [notice, setNotice] = useState<Notice | null>(null);
  const [titles, setTitles] = useState({ socialTitle: '', trustTitle: '' });
  const [socialMedia, setSocialMedia] = useState({ instagramUrl: '', xUrl: '', facebookUrl: '', telegramUrl: '' });
  const DEFAULT_SOCIAL_APPEARANCE: SocialIconAppearance = {
    iconSize: 16, logoSize: 72, circleSize: 36, borderThickness: 1, radiusMode: 'circle',
    backgroundColor: '#111827', borderColor: '#374151', glowColor: '#6366f1', glowIntensity: 0, iconOpacity: 100,
  };
  const [appearance, setAppearance] = useState<SocialIconAppearance>(DEFAULT_SOCIAL_APPEARANCE);
  const initialized = useRef(false);

  useEffect(() => {
    if (query.data && !initialized.current) {
      setTitles({ socialTitle: query.data.socialTitle, trustTitle: query.data.trustTitle });
      setSocialMedia({
        instagramUrl: query.data.instagramUrl ?? '',
        xUrl: query.data.xUrl ?? '',
        facebookUrl: query.data.facebookUrl ?? '',
        telegramUrl: query.data.telegramUrl ?? '',
      });
      if (query.data.appearance) setAppearance({ ...DEFAULT_SOCIAL_APPEARANCE, ...query.data.appearance });
      initialized.current = true;
    }
  }, [query.data]);

  const [editing, setEditing] = useState<SocialTrustItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [newGroup, setNewGroup] = useState<'social' | 'trust'>('social');
  const [newName, setNewName] = useState('');
  const [newHref, setNewHref] = useState('');
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(false);
  const [newFilePreviewUrl, setNewFilePreviewUrl] = useState<string | null>(null);
  const [replacementPreviewUrl, setReplacementPreviewUrl] = useState<string | null>(null);
  const [storedPreviewUrls, setStoredPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!file) {
      setNewFilePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setNewFilePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!replacementFile) {
      setReplacementPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(replacementFile);
    setReplacementPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [replacementFile]);

  useEffect(() => {
    if (!preview || !query.data?.items.length) {
      setStoredPreviewUrls({});
      return;
    }
    let disposed = false;
    const objectUrls: string[] = [];
    void Promise.all(query.data.items.map(async (item) => {
      try {
        const blob = await previewAdminSocialTrustIcon(item.id);
        if (disposed) return null;
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        return [item.objectPath, url] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!disposed) setStoredPreviewUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    });
    return () => {
      disposed = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [preview, query.data?.items]);

  const previewSocialItems = useMemo(() => {
    let items = [...(query.data?.items ?? [])];
    if (editing) {
      const index = items.findIndex((item) => item.id === editing.id);
      if (index >= 0) items[index] = editing;
    }
    if (newName.trim() && newHref.trim()) {
      items.push({
        id: '00000000-0000-0000-0000-000000000000',
        group: newGroup,
        name: newName.trim(),
        href: newHref.trim(),
        objectPath: file && newFilePreviewUrl ? 'preview-social-trust-icon' : null,
        enabled: true,
        createdAt: new Date(0).toISOString(),
      });
    }
    return items.sort(automaticNameOrder);
  }, [editing, file, newFilePreviewUrl, newGroup, newHref, newName, query.data?.items]);

  const saveSocialMedia = () => {
    setNotice(null);
    updateSocialMedia.mutate({
      data: {
        instagramUrl: socialMedia.instagramUrl.trim() || null,
        xUrl: socialMedia.xUrl.trim() || null,
        facebookUrl: socialMedia.facebookUrl.trim() || null,
        telegramUrl: socialMedia.telegramUrl.trim() || null,
        appearance,
      }
    }, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: 'Social media links saved as a draft. Publish the site snapshot to make it public.' });
        void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
      },
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save social media links.') }),
    });
  };

  const saveTitles = () => {
    setNotice(null);
    updateTitles.mutate({ data: titles }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
        setNotice({ kind: 'success', text: 'Titles saved as a draft. Publish the site snapshot to make it public.' });
      },
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save titles.') }),
    });
  };

  const addItem = async () => {
    if (!newName.trim() || !newHref.trim()) {
      setNotice({ kind: 'error', text: 'Name and URL are required.' });
      return;
    }
    if (file && (!['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setNotice({ kind: 'error', text: 'Choose an SVG, PNG, WebP, JPG, or JPEG icon up to 5 MB.' });
      return;
    }
    setNotice(null);
    try {
      let objectPath: string | null = null;
      if (file) {
        const intent = await upload.mutateAsync({ data: { contentType: file.type as ImageUploadInputContentType } });
        const response = await fetch(intent.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
        objectPath = intent.objectPath;
      }
      await create.mutateAsync({ data: {
        group: newGroup,
        name: newName.trim(),
        href: newHref.trim(),
        objectPath,
        enabled: true,
      } });
      setFile(null);
      setNewName('');
      setNewHref('');
      setNotice({ kind: 'success', text: 'Item uploaded as draft. Publish the site snapshot to make it public.' });
      void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
    } catch (error) { setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to upload item icon.') }); }
  };

  const saveEdited = (item: SocialTrustItem, patch: Partial<SocialTrustItem>) => {
    update.mutate({ id: item.id, data: patch as any }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getPreviewAdminSocialTrustIconQueryKey(item.id) });
        setEditing(null);
        setNotice({ kind: 'success', text: 'Item draft saved. Publish the site snapshot to make it public.' });
      },
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to update item.') })
    });
  };

  const replaceIcon = async (item: SocialTrustItem) => {
    if (!replacementFile) return;
    if (!['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'].includes(replacementFile.type) || replacementFile.size > 5 * 1024 * 1024) {
      setNotice({ kind: 'error', text: 'Choose an SVG, PNG, WebP, JPG, or JPEG icon up to 5 MB.' });
      return;
    }
    try {
      const intent = await upload.mutateAsync({ data: { contentType: replacementFile.type as ImageUploadInputContentType } });
      const response = await fetch(intent.uploadURL, { method: 'PUT', headers: { 'Content-Type': replacementFile.type }, body: replacementFile });
      if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
      await update.mutateAsync({ id: item.id, data: { objectPath: intent.objectPath } });
      setReplacementFile(null);
      void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getPreviewAdminSocialTrustIconQueryKey(item.id) });
      setNotice({ kind: 'success', text: 'Icon replaced in the draft. Publish the site snapshot to make it public.' });
    } catch (error) {
      setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to replace icon.') });
    }
  };

  return <section className="space-y-5" data-testid="social-trust-editor">
    <div className="grid gap-6 md:grid-cols-2">
      <div className="panel p-5 space-y-4 md:col-span-2" data-testid="social-icon-appearance-editor">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Social icon appearance</h3>
            <p className="text-sm text-muted-foreground">Preview changes immediately; save them with the social media draft.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button button-secondary h-8 px-2 text-xs" onClick={() => setAppearance(DEFAULT_SOCIAL_APPEARANCE)} data-testid="button-reset-social-appearance">Reset to Default</button>
            <button type="button" className="button button-primary h-8 px-2 text-xs" onClick={saveSocialMedia} disabled={updateSocialMedia.isPending} data-testid="button-save-social-media"><Save size={13} /> Save appearance draft</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
          {([
            ['iconSize', 'Icon size', 8, 48],
            ['logoSize', 'Logo inside circle (%)', 20, 100],
            ['circleSize', 'Circle size', 24, 80],
            ['borderThickness', 'Border thickness', 0, 8],
            ['glowIntensity', 'Glow intensity', 0, 100],
            ['iconOpacity', 'Icon opacity', 0, 100],
          ] as const).map(([key, label, min, max]) => (
            <label key={key} className="text-xs font-semibold">
              {label}
              <input className="admin-input mt-1 w-full" type="number" min={min} max={max} value={appearance[key]} onChange={(event) => setAppearance((current) => ({ ...current, [key]: Number(event.target.value) }))} data-testid={`input-social-appearance-${key}`} />
            </label>
          ))}
          <label className="text-xs font-semibold">Radius mode
            <select className="admin-input mt-1 w-full" value={appearance.radiusMode} onChange={(event) => setAppearance((current) => ({ ...current, radiusMode: event.target.value as SocialIconAppearance['radiusMode'] }))} data-testid="input-social-appearance-radius">
              <option value="circle">Circle</option><option value="rounded">Rounded</option><option value="square">Square</option>
            </select>
          </label>
          {([
            ['backgroundColor', 'Background color'],
            ['borderColor', 'Border color'],
            ['glowColor', 'Glow color'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs font-semibold">{label}
              <input className="admin-input mt-1 h-9 w-full p-1" type="color" value={appearance[key]} onChange={(event) => setAppearance((current) => ({ ...current, [key]: event.target.value }))} data-testid={`input-social-appearance-${key}`} />
            </label>
          ))}
        </div>
        <SocialIconAppearancePreview
          items={query.data?.items ?? []}
          appearance={appearance}
          pendingName={newName}
          pendingImage={newFilePreviewUrl}
        />
      </div>

      <div className="panel p-5 space-y-4">
        <h3 className="font-bold">Social & Trust Titles</h3>
        <div>
          <label className="mb-1 block text-sm font-semibold">Social Media Section Title</label>
          <input className="admin-input w-full" value={titles.socialTitle} onChange={e => setTitles(t => ({ ...t, socialTitle: e.target.value }))} data-testid="input-social-title" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Trust Links Section Title</label>
          <input className="admin-input w-full" value={titles.trustTitle} onChange={e => setTitles(t => ({ ...t, trustTitle: e.target.value }))} data-testid="input-trust-title" />
        </div>
        <button type="button" className="button button-primary" onClick={saveTitles} disabled={updateTitles.isPending} data-testid="button-save-social-trust-titles"><Save size={15} /> Save draft</button>
      </div>

      <div className="panel p-5 space-y-4">
        <h3 className="font-bold">+ Add Social Media</h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={newGroup === 'social'} onChange={() => setNewGroup('social')} data-testid="input-new-group-social" /> Social</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={newGroup === 'trust'} onChange={() => setNewGroup('trust')} data-testid="input-new-group-trust" /> Trust</label>
        </div>
        <input className="admin-input w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Platform name" data-testid="input-new-social-trust-name" />
        <input className="admin-input w-full" value={newHref} onChange={(e) => setNewHref(e.target.value)} placeholder="https://example.com/your-profile" data-testid="input-new-social-trust-href" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="button button-secondary cursor-pointer shrink-0"><ImagePlus size={15} /> Choose icon<input className="sr-only" type="file" accept=".svg,.png,.webp,.jpg,.jpeg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="input-social-trust-file" /></label>
          <span className="flex-1 text-sm text-muted-foreground truncate">{file?.name || 'PNG, JPEG, WebP, or SVG'}</span>
          {newFilePreviewUrl && <img src={newFilePreviewUrl} alt="New social media logo preview" className="h-12 w-12 rounded-lg border border-border bg-muted object-contain p-1" data-testid="preview-new-social-trust-icon" />}
        </div>
        <div className="flex gap-2">
           <button type="button" className="button button-primary flex-1" disabled={!newName.trim() || !newHref.trim() || upload.isPending || create.isPending} onClick={() => void addItem()} data-testid="button-upload-social-trust"><Save size={15} /> Save draft</button>
          <button type="button" className="button button-secondary flex-1" onClick={() => setPreview(p => !p)}><Eye size={15} /> {preview ? 'Close preview' : 'Preview draft'}</button>
          <PublishSnapshotButton setNotice={setNotice} />
        </div>
      </div>
    </div>

    {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}

    {preview && (
      <div className="panel p-0 h-[600px] mb-4">
        <LivePreviewFrame draftState={{
          pageKey: 'home',
          socialTrust: {
            socialTitle: titles.socialTitle,
            trustTitle: titles.trustTitle,
            instagramUrl: socialMedia.instagramUrl.trim() || null,
            xUrl: socialMedia.xUrl.trim() || null,
            facebookUrl: socialMedia.facebookUrl.trim() || null,
            telegramUrl: socialMedia.telegramUrl.trim() || null,
             appearance,
             items: previewSocialItems,
           },
           assetUrls: {
             ...storedPreviewUrls,
             ...(newFilePreviewUrl ? { 'preview-social-trust-icon': newFilePreviewUrl } : {}),
             ...(editing && editing.objectPath && replacementPreviewUrl ? { [editing.objectPath]: replacementPreviewUrl } : {}),
           },
        }} />
      </div>
    )}

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...(query.data?.items ?? [])].sort(automaticNameOrder).map((item) => (
        <div
          className="panel overflow-hidden p-4 relative"
          key={item.id}
          data-testid={`card-social-trust-${item.id}`}
        >
          <div className="flex h-24 items-center justify-center rounded-lg bg-muted p-3 relative group">
            {editing?.id === item.id && replacementPreviewUrl
              ? <img src={replacementPreviewUrl} alt={`${item.name} replacement preview`} className="max-h-full max-w-full object-contain" data-testid={`preview-replacement-social-trust-icon-${item.id}`} />
              : <AdminSocialTrustIconPreview item={item} />}
          </div>
          {editing?.id === item.id ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={editing.group === 'social'} onChange={() => setEditing({ ...editing, group: 'social' as SocialTrustItemUpdateGroup })} data-testid={`input-edit-group-social-${item.id}`} /> Social</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={editing.group === 'trust'} onChange={() => setEditing({ ...editing, group: 'trust' as SocialTrustItemUpdateGroup })} data-testid={`input-edit-group-trust-${item.id}`} /> Trust</label>
              </div>
              <input className="admin-input w-full" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Name" placeholder="Name" data-testid={`input-edit-name-${item.id}`} />
              <input className="admin-input w-full" value={editing.href} onChange={(e) => setEditing({ ...editing, href: e.target.value })} aria-label="URL" placeholder="https://" data-testid={`input-edit-href-${item.id}`} />
              <div className="flex flex-wrap items-center gap-2">
                <label className="button button-secondary h-8 cursor-pointer px-2 text-xs">
                  Replace icon
                  <input className="sr-only" type="file" accept=".svg,.png,.webp,.jpg,.jpeg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setReplacementFile(e.target.files?.[0] ?? null)} data-testid={`input-replace-social-trust-icon-${item.id}`} />
                </label>
                {replacementFile && <button type="button" className="button button-secondary h-8 px-2 text-xs" onClick={() => void replaceIcon(item)} disabled={upload.isPending || update.isPending} data-testid={`button-replace-social-trust-icon-${item.id}`}>Upload replacement</button>}
                 {editing.objectPath && <button type="button" className="button button-secondary h-8 px-2 text-xs text-destructive" onClick={() => saveEdited(item, { objectPath: null })} disabled={update.isPending} data-testid={`button-remove-social-trust-icon-${item.id}`}>Remove icon</button>}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} data-testid={`input-edit-enabled-${item.id}`} /> Enabled</label>
              <div className="flex gap-2">
                <button type="button" className="button button-primary h-8 px-2 text-xs" onClick={() => saveEdited(item, { name: editing.name, href: editing.href, enabled: editing.enabled, group: editing.group })} data-testid={`button-save-social-trust-${item.id}`}><Save size={13} /> Save</button>
                <button type="button" className="button button-secondary h-8 px-2 text-xs" onClick={() => setEditing(null)} data-testid={`button-cancel-social-trust-${item.id}`}><X size={13} /></button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="min-w-0 truncate text-sm font-semibold">{item.name}</span>
                <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.group}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="button button-secondary h-8 px-2 text-xs flex-1" onClick={() => setEditing(item)} data-testid={`button-edit-social-trust-${item.id}`}>Edit</button>
                <button type="button" className="button button-secondary h-8 px-2 text-xs text-destructive shrink-0" onClick={() => remove.mutate({ id: item.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() }); setNotice({ kind: 'success', text: 'Item removed. Publish the site snapshot to make it public.' }); }, onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to remove item.') }) })} data-testid={`button-remove-social-trust-${item.id}`}><Trash2 size={13} /></button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  </section>;
}

function ContactInbox() {
  const query = useListContactSubmissions({ limit: 100 }, { query: { queryKey: getListContactSubmissionsQueryKey({ limit: 100 }), staleTime: 30_000 } });
  const contactPage = useGetAdminSiteContent('contact-us', { query: { queryKey: getGetAdminSiteContentQueryKey('contact-us'), staleTime: 0 } });
  const [preview, setPreview] = useState(false);
  const content = contactPage.data?.draft?.content ?? contactPage.data?.published?.content;
  return <section className="space-y-5" data-testid="contact-inbox">
    <div className="panel flex flex-wrap items-center gap-3 p-5">
      <Inbox className="text-primary" />
      <div className="min-w-0 flex-1"><h2 className="font-bold">Operator contact inbox</h2><p className="text-sm text-muted-foreground">Validated public contact requests are stored separately and visible to operators.</p></div>
      <button type="button" className="button button-secondary" onClick={() => setPreview((value) => !value)} data-testid="button-preview-contact-page"><Eye size={15} /> {preview ? 'Close preview' : 'Preview contact page'}</button>
    </div>
    {preview && <div className="panel h-[600px] p-0"><LivePreviewFrame draftState={{ pageKey: 'contact-us', content }} /></div>}
    <div className="panel divide-y divide-border overflow-hidden">{query.isLoading ? <LoadingBlock rows={5} /> : (query.data ?? []).length ? (query.data ?? []).map((submission) => <article className="p-5" key={submission.id} data-testid={`row-contact-submission-${submission.id}`}><div className="flex flex-wrap justify-between gap-2"><strong>{submission.name}</strong><time className="text-xs text-muted-foreground">{new Date(submission.createdAt).toLocaleString()}</time></div><a className="mt-1 inline-flex items-center gap-1 text-sm text-primary" href={`mailto:${submission.email}`}><Link2 size={13} /> {submission.email}</a><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{submission.message}</p></article>) : <p className="p-8 text-center text-sm text-muted-foreground">No contact requests yet.</p>}</div>
  </section>;
}

function publishedPageContent(pages: Array<{ pageKey: SitePageKey; content: Record<string, unknown> }>, pageKey: SitePageKey) {
  return pages.find((page) => page.pageKey === pageKey)?.content;
}

export function PublicSitePage({ pageKey }: { pageKey: SitePageKey }) {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });
  const content = preview.active && preview.pageKey === pageKey
    ? preview.content
    : publishedPageContent(published.data?.pages ?? [], pageKey);
  if (published.isLoading) return <PublicShell><LoadingBlock rows={8} /></PublicShell>;
  return <PublicSitePageView pageKey={pageKey} content={content} preview={preview} />;
}

function PublicSitePageView({ pageKey, content, preview }: { pageKey: SitePageKey; content?: Record<string, unknown>; preview: ReturnType<typeof useSitePreview> }) {
  const title = PAGE_LABELS[pageKey];
  const visibility = content?.visibility && typeof content.visibility === 'object'
    ? content.visibility as Record<string, unknown>
    : {};
  if (visibility.enabled === false) return <NotFound />;
  const mediaUrl = (objectPath: string) => preview.assetUrls?.[objectPath]
    ?? (preview.active
      ? `${basePath}/api/admin/site-page-media/${pageKey}/${objectPath.split('/').pop()}/preview`
      : `${basePath}/api/storage/objects/site-page-media/${objectPath.split('/').pop()}`);
  return <PublicShell><PublicPageMetadata content={content} fallbackTitle={title} /><PublishedContentRenderer content={content} fallbackTitle={title} mediaUrl={mediaUrl} /></PublicShell>;
}

function PublicPageMetadata({ content, fallbackTitle }: { content?: Record<string, unknown>; fallbackTitle: string }) {
  const seo = content?.seo && typeof content.seo === 'object' ? content.seo as Record<string, unknown> : {};
  const title = contentValue(seo, ['title'], contentValue(content, ['title', 'headline'], fallbackTitle));
  const description = contentValue(seo, ['description'], contentValue(content, ['subtitle', 'description', 'intro']));
  useEffect(() => {
    document.title = `${title} | QuickXchange`;
    if (!description) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [description, title]);
  return null;
}

import { useSitePreview } from '../components/site-preview-context';

export function PublicContactPage() {
  const preview = useSitePreview();
  const published = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 60_000 } });
  const content = preview.active && preview.pageKey === 'contact-us'
    ? preview.content
    : publishedPageContent(published.data?.pages ?? [], 'contact-us');
  const submit = useCreateContactSubmission();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const valid = form.name.trim().length >= 1 && form.name.trim().length <= 120 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.email.length <= 320 &&
    form.message.trim().length >= 1 && form.message.length <= 5000;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!valid) { setNotice({ kind: 'error', text: 'Enter a name, valid email address, and message.' }); return; }
    submit.mutate({ data: { name: form.name.trim(), email: form.email.trim(), message: form.message.trim() } }, {
      onSuccess: () => { setForm({ name: '', email: '', message: '' }); setNotice({ kind: 'success', text: 'Thanks — your message was sent to our operators.' }); },
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to send your message right now.') }),
    });
  };
  return <PublicShell><PublishedContentRenderer content={content} fallbackTitle="Contact Us" /><section className="mx-auto mb-20 max-w-2xl px-6 md:px-8"><form className="panel space-y-5 p-6 md:p-8" onSubmit={onSubmit} noValidate data-testid="form-contact"><div><label className="mb-2 block text-sm font-semibold" htmlFor="contact-name">Name</label><input id="contact-name" className="admin-input w-full" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-contact-name" /></div><div><label className="mb-2 block text-sm font-semibold" htmlFor="contact-email">Email</label><input id="contact-email" className="admin-input w-full" type="email" required maxLength={320} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-contact-email" /></div><div><label className="mb-2 block text-sm font-semibold" htmlFor="contact-message">Message</label><textarea id="contact-message" className="admin-input min-h-36 w-full" required maxLength={5000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} data-testid="input-contact-message" /></div>{notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}<button className="button button-primary" type="submit" disabled={submit.isPending} data-testid="button-submit-contact">{submit.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Send message</button></form></section></PublicShell>;
}

export function AdminSiteContentPage() {
  const { can, isOwner } = useAdminPermissions();
  const canManage = can('site_settings.manage');
  const [tab, setTab] = useState<'pages' | 'navigation' | 'logos' | 'social-trust' | 'inbox'>('pages');
  const draftNavigation = useListAdminNavigation({ query: { queryKey: getListAdminNavigationQueryKey(), staleTime: 0 } });
  const draftLogos = useListAdminPartnerLogos({ query: { queryKey: getListAdminPartnerLogosQueryKey(), staleTime: 0 } });
  const draftSocialTrust = useGetAdminSocialTrust({ query: { queryKey: getGetAdminSocialTrustQueryKey(), staleTime: 0 } });
  const publishedNavigation = useGetPublishedNavigation({ query: { queryKey: getGetPublishedNavigationQueryKey(), staleTime: 0 } });
  const publishedLogos = useGetPublishedPartnerLogos({ query: { queryKey: getGetPublishedPartnerLogosQueryKey(), staleTime: 0 } });
  const publishedSiteContent = useGetPublishedSiteContent({ query: { queryKey: getGetPublishedSiteContentQueryKey(), staleTime: 0 } });
  const publish = usePublishSitePublication();
  const [publicationNotice, setPublicationNotice] = useState<Notice | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const draftNavigationSnapshot = JSON.stringify((draftNavigation.data ?? []).filter(({ enabled }) => enabled).map(({ id, label, href, enabled, header, footer, widget }) => ({ id, label, href, enabled, header, footer, widget })));
  const publishedNavigationSnapshot = JSON.stringify((publishedNavigation.data ?? []).map(({ id, label, href, enabled, header, footer, widget }) => ({ id, label, href, enabled, header, footer, widget })));
  const draftLogoSnapshot = JSON.stringify((draftLogos.data ?? []).filter(({ enabled }) => enabled).map(({ id, name, objectPath, link, enabled, createdAt }) => ({ id, name, objectPath, link, enabled, createdAt })));
  const publishedLogoSnapshot = JSON.stringify((publishedLogos.data ?? []).map(({ id, name, objectPath, link, enabled, createdAt }) => ({ id, name, objectPath, link, enabled, createdAt })));

  const draftSocialTrustSnapshot = JSON.stringify({
    socialTitle: draftSocialTrust.data?.socialTitle,
    trustTitle: draftSocialTrust.data?.trustTitle,
    items: (draftSocialTrust.data?.items ?? []).filter(i => i.enabled).map(({ id, group, name, href, objectPath, enabled, createdAt }) => ({ id, group, name, href, objectPath, enabled, createdAt }))
  });
  const publishedSocialTrustSnapshot = JSON.stringify({
    socialTitle: publishedSiteContent.data?.socialTrust?.socialTitle,
    trustTitle: publishedSiteContent.data?.socialTrust?.trustTitle,
    items: (publishedSiteContent.data?.socialTrust?.items ?? []).map(({ id, group, name, href, objectPath, enabled, createdAt }) => ({ id, group, name, href, objectPath, enabled, createdAt }))
  });

  const publicationDataReady = draftNavigation.isSuccess && draftLogos.isSuccess && publishedNavigation.isSuccess && publishedLogos.isSuccess && draftSocialTrust.isSuccess && publishedSiteContent.isSuccess;
  const hasPublicationChanges = publicationDataReady && (draftNavigationSnapshot !== publishedNavigationSnapshot || draftLogoSnapshot !== publishedLogoSnapshot || draftSocialTrustSnapshot !== publishedSocialTrustSnapshot);

  const publishSnapshot = () => {
    setPublicationNotice(null);
    publish.mutate(undefined, {
      onSuccess: (revision) => {
        setPublishedVersion(revision.version);
        setPublicationNotice({ kind: 'success', text: `Published snapshot v${revision.version}. Public navigation, partner logos, and Social & Trust links are now live.` });
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetPublishedSiteContentQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetPublishedNavigationQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetPublishedPartnerLogosQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListAdminNavigationQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListAdminPartnerLogosQueryKey() }),
        ]);
        void queryClient.invalidateQueries({
          predicate: ({ queryKey }) => {
            const key = queryKey[0];
            return typeof key === 'string' && (
              key.startsWith('/api/site-content') ||
              key.startsWith('/api/site-navigation') ||
              key.startsWith('/api/partner-logos') ||
              key.startsWith('/api/admin/site-content') ||
              key.startsWith('/api/admin/site-navigation') ||
              key.startsWith('/api/admin/partner-logos') ||
              key.startsWith('/api/admin/social-trust')
            );
          },
        });
      },
      onError: (error) => setPublicationNotice({ kind: 'error', text: ownerPublicationError(error) }),
    });
  };

  return <AdminShell eyebrow="CONTENT MANAGEMENT" title="Public site content" subtitle="Draft, preview, publish, and manage the public experience without changing exchange logic." requiredPermission="site_settings.view">
    <section className="panel mb-6 flex flex-col gap-4 border-primary/30 bg-primary/5 p-5 lg:flex-row lg:items-center lg:justify-between" data-testid="site-publication-status">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">Navigation and partner-logo publication</h2>
          <span className={cn('rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider', hasPublicationChanges ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-success/15 text-success')}>{hasPublicationChanges ? 'Unpublished changes' : publishedVersion ? `Published v${publishedVersion}` : 'Published state current'}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {publicationDataReady
            ? `Published state: ${publishedNavigation.data?.length ?? 0} navigation links and ${publishedLogos.data?.length ?? 0} partner logos. ${publishedVersion ? `Last published v${publishedVersion}.` : 'The current version is not exposed by the read API.'}`
            : 'Checking the current published snapshot…'}
        </p>
        {publicationNotice && <div className="mt-3"><InlineNotice kind={publicationNotice.kind}>{publicationNotice.text}</InlineNotice></div>}
      </div>
       {isOwner && canManage && <button type="button" className="button button-primary shrink-0" disabled={publish.isPending || !publicationDataReady || !hasPublicationChanges} onClick={publishSnapshot} data-testid="button-publish-site-snapshot">
        {publish.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {publish.isPending ? 'Publishing…' : 'Publish site snapshot'}
       </button>}
    </section>
    <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Site management areas">
      {([['pages', 'Pages'], ['navigation', 'Navigation'], ['logos', 'Partner logos'], ['social-trust', 'Social Media'], ['inbox', 'Contact inbox']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={cn('button', tab === value ? 'button-primary' : 'button-secondary')} onClick={() => setTab(value)} data-testid={`tab-site-management-${value}`}>{value === 'pages' ? <Save size={15} /> : value === 'navigation' ? <Link2 size={15} /> : value === 'logos' ? <ImagePlus size={15} /> : value === 'social-trust' ? <Share2 size={15} /> : <Inbox size={15} />}{label}</button>)}
    </div>
     {canManage
       ? (tab === 'pages' ? <DraftEditor /> : tab === 'navigation' ? <NavigationEditor /> : tab === 'logos' ? <PartnerLogosEditor /> : tab === 'social-trust' ? <SocialTrustEditor /> : <ContactInbox />)
       : <section className="panel p-6 text-sm text-muted-foreground" data-testid="site-content-read-only">You have view-only access to site settings.</section>}
   </AdminShell>;
}
