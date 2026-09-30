import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, GripVertical, ImagePlus, Save, Trash2 } from 'lucide-react';
import {
  getGetAdminSocialTrustQueryKey,
  useCreateAdminSocialTrustItem,
  useGetAdminSocialTrust,
  useGetPublicNotificationSettings,
  useRemoveAdminSocialTrustItem,
  useRequestSocialTrustIconUpload,
  useUpdateAdminSocialMedia,
  useUpdateAdminSocialTrustItem,
  useUpdateAdminSocialTrustTitles,
} from '@workspace/api-client-react';
import type { ImageUploadInputContentType, SocialIconAppearance, SocialTrustItem } from '@workspace/api-client-react';
import { apiErrorText, queryClient } from '../App';
import { basePath, InlineNotice } from './shared-app-ui';
import { LivePreviewFrame } from './live-preview-frame';
import {
  normalizeTelegramSupportInput,
  resolvePublishedTelegramSupportUrl,
  telegramSupportHandle,
} from '../lib/telegram-support';
import type { TelegramSupportPreviewSnapshot } from '../lib/telegram-support-value';
import './site-content-social.css';

type SocialAppearanceWithDepth = SocialIconAppearance & { depthIntensity?: number };
const DEFAULT_APPEARANCE: SocialIconAppearance = {
  iconSize: 20, logoSize: 76, circleSize: 42, borderThickness: 1, radiusMode: 'circle',
  backgroundColor: '#ffffff', borderColor: '#dce3ed', glowColor: '#38bdf8', glowIntensity: 0,
  iconOpacity: 100, spacing: 14, alignment: 'left', hoverAnimation: 'lift', layout: 'horizontal',
  container: 'none', titleFontSize: 18, titleAlignment: 'left', socialTitleVisible: true,
  trustTitleVisible: true, trustTitleFontSize: 18, trustTitleAlignment: 'left',
};
const accept = '.svg,.png,.webp,.jpg,.jpeg,image/png,image/jpeg,image/webp,image/svg+xml';
type IconKey = 'objectPath' | 'lightObjectPath' | 'darkObjectPath';
type EditorNotice = { kind: 'error' | 'success'; text: string };
type ItemDraft = Pick<SocialTrustItem, 'group' | 'name' | 'href' | 'enabled' | 'displayMode' | 'appearance'> & {
  objectPath: string | null;
  lightObjectPath: string | null;
  darkObjectPath: string | null;
  sortOrder?: number;
};

function fileType(file: File): ImageUploadInputContentType | null {
  if (['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return file.type as ImageUploadInputContentType;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ['jpg', 'jpeg'].includes(ext ?? '') ? 'image/jpeg' : null;
}

export function SocialTrustEditor({ view = 'all' }: { view?: 'all' | 'social' | 'trust' }) {
  const query = useGetAdminSocialTrust({ query: { queryKey: getGetAdminSocialTrustQueryKey(), staleTime: 0 } });
  const notificationSettings = useGetPublicNotificationSettings();
  const upload = useRequestSocialTrustIconUpload();
  const create = useCreateAdminSocialTrustItem();
  const update = useUpdateAdminSocialTrustItem();
  const remove = useRemoveAdminSocialTrustItem();
  const saveSocial = useUpdateAdminSocialMedia();
  const saveTitles = useUpdateAdminSocialTrustTitles();
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [createNotice, setCreateNotice] = useState<EditorNotice | null>(null);
  const [itemNotices, setItemNotices] = useState<Record<string, EditorNotice>>({});
  const [titles, setTitles] = useState({ socialTitle: 'Stay connected with us', trustTitle: 'Share your feedback with us' });
  const [telegramUrl, setTelegramUrl] = useState('');
  const [appearance, setAppearance] = useState<SocialAppearanceWithDepth>({ ...DEFAULT_APPEARANCE, depthIntensity: 45 });
  const [trustAppearance, setTrustAppearance] = useState<SocialIconAppearance>(DEFAULT_APPEARANCE);
  const [initialized, setInitialized] = useState(false);
  const [newItem, setNewItem] = useState({ group: 'social' as 'social' | 'trust', name: '', href: '', displayMode: 'icon-only' as 'icon-only' | 'icon-name' });
  const [newFiles, setNewFiles] = useState<Partial<Record<IconKey, File>>>({});
  const [uploadedPreviews, setUploadedPreviews] = useState<Record<string, string>>({});
  const uploadedPreviewsRef = useRef<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    if (!query.data || initialized) return;
    setTitles({ socialTitle: query.data.socialTitle, trustTitle: query.data.trustTitle });
    setTelegramUrl(query.data.telegramUrl ?? '');
    setAppearance({ ...DEFAULT_APPEARANCE, depthIntensity: 45, ...(query.data.appearance as SocialAppearanceWithDepth | undefined) });
    setTrustAppearance({ ...DEFAULT_APPEARANCE, ...query.data.trustAppearance });
    setInitialized(true);
  }, [query.data, initialized]);

  const items = useMemo(() => [...(query.data?.items ?? [])].sort((a, b) =>
    a.group.localeCompare(b.group) || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)), [query.data?.items]);
  const visibleGroups = (view === 'all' ? ['social', 'trust'] : [view]) as ('social' | 'trust')[];
  const heading = view === 'social' ? 'Social Media' : view === 'trust' ? 'Feedback / Trust' : 'Social Media & Feedback / Trust';
  const description = view === 'social'
    ? 'Set the footer heading and icon presentation, then manage your official social profiles.'
    : view === 'trust'
      ? 'Set the review heading and logo presentation, then manage your feedback destinations.'
      : 'Configure your social icons and review destinations in the landing-page footer.';

  const uploadOne = async (file: File) => {
    const contentType = fileType(file);
    if (!contentType || file.size > 5 * 1024 * 1024) throw new Error('Choose an SVG, PNG, WebP, JPG, or JPEG file up to 5 MB.');
    const intent = await upload.mutateAsync({ data: { contentType } });
    const response = await fetch(intent.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
    if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
    return intent.objectPath;
  };

  const addItem = async () => {
    if (!newItem.name.trim() || !newItem.href.trim()) return setCreateNotice({ kind: 'error', text: 'Platform name and profile URL are required.' });
    if (!newFiles.objectPath) return setCreateNotice({ kind: 'error', text: 'Upload the icon that should appear on your website.' });
    setCreateNotice(null);
    try {
      const [objectPath, lightObjectPath, darkObjectPath] = await Promise.all([
        uploadOne(newFiles.objectPath),
        newFiles.lightObjectPath ? uploadOne(newFiles.lightObjectPath) : Promise.resolve(null),
        newFiles.darkObjectPath ? uploadOne(newFiles.darkObjectPath) : Promise.resolve(null),
      ]);
      const created = await create.mutateAsync({ data: {
        group: view === 'all' ? newItem.group : view, name: newItem.name.trim(), href: newItem.href.trim(),
        objectPath, lightObjectPath, darkObjectPath, appearance: lightObjectPath || darkObjectPath ? 'separate' : 'same',
        displayMode: newItem.displayMode, enabled: true,
      } });
      queryClient.setQueryData<NonNullable<typeof query.data>>(getGetAdminSocialTrustQueryKey(), (current) =>
        current ? { ...current, items: [...current.items, created] } : current);
      setNewItem((current) => ({ ...current, name: '', href: '' }));
      setNewFiles({});
      setCreateNotice({ kind: 'success', text: 'Item saved as a draft. It appears on the landing-page preview when Visible is on; publishing is a separate action.' });
      void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
    } catch (error) { setCreateNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save this item.') }); }
  };

  const saveItem = async (item: SocialTrustItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    try {
      setItemNotices((current) => { const next = { ...current }; delete next[item.id]; return next; });
      const saved = await update.mutateAsync({ id: item.id, data: draft });
      queryClient.setQueryData<NonNullable<typeof query.data>>(getGetAdminSocialTrustQueryKey(), (current) =>
        current ? { ...current, items: current.items.map((entry) => entry.id === item.id ? saved : entry) } : current);
      setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
      setItemNotices((current) => ({ ...current, [item.id]: { kind: 'success', text: 'Changes saved as a draft.' } }));
      void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
    } catch (error) { setItemNotices((current) => ({ ...current, [item.id]: { kind: 'error', text: apiErrorText(error, 'Unable to save this item.') } })); }
  };

  const changeGroupOrder = async (source: SocialTrustItem, target: SocialTrustItem) => {
    if (source.id === target.id || source.group !== target.group) return;
    const groupItems = items.filter((item) => item.group === source.group);
    const reordered = [...groupItems];
    const from = reordered.findIndex((item) => item.id === source.id);
    const to = reordered.findIndex((item) => item.id === target.id);
    reordered.splice(to, 0, ...reordered.splice(from, 1));
    try {
      await Promise.all(reordered.map((item, sortOrder) => update.mutateAsync({ id: item.id, data: { sortOrder } })));
      await queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
    } catch (error) { setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save this order.') }); }
  };

  const saveStyle = async () => {
    if (!query.data || !initialized) return;
    const telegramInput = view === 'trust'
      ? { value: null, error: null }
      : normalizeTelegramSupportInput(telegramUrl);
    if (telegramInput.error) {
      setNotice({ kind: 'error', text: telegramInput.error });
      return;
    }
    try {
      // The endpoint accepts both sections. A split tab must never overwrite the other section
      // with stale local state (or with default values while the initial request is loading).
      const latest = await query.refetch();
      if (latest.isError || !latest.data) throw latest.error ?? new Error('Unable to load current section settings.');
      const nextTitles = {
        socialTitle: view === 'trust' ? latest.data.socialTitle : titles.socialTitle,
        trustTitle: view === 'social' ? latest.data.trustTitle : titles.trustTitle,
      };
      await Promise.all([
        saveTitles.mutateAsync({ data: nextTitles }),
        saveSocial.mutateAsync({ data: {
          instagramUrl: latest.data.instagramUrl ?? null, xUrl: latest.data.xUrl ?? null,
          facebookUrl: latest.data.facebookUrl ?? null,
          telegramUrl: view === 'trust' ? latest.data.telegramUrl ?? null : telegramInput.value,
          appearance: view === 'trust' ? latest.data.appearance : appearance,
          trustAppearance: view === 'social' ? latest.data.trustAppearance : trustAppearance,
        } }),
      ]);
      await queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
      setNotice({ kind: 'success', text: `${heading} settings saved as a draft. Publish the site snapshot separately to make them live.` });
    } catch (error) { setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save social and trust settings.') }); }
  };

  const localPreview = useMemo(() => {
    const assets: Record<string, string> = {};
    const urls: string[] = [];
    for (const [key, file] of Object.entries(newFiles)) {
      if (!file) continue;
      const url = URL.createObjectURL(file);
      urls.push(url);
      assets[`new-social-${key}`] = url;
    }
    return { assets, urls };
  }, [newFiles]);
  useEffect(() => () => localPreview.urls.forEach((url) => URL.revokeObjectURL(url)), [localPreview]);
  useEffect(() => () => Object.values(uploadedPreviewsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);
  const trustpilotUrl = notificationSettings.data?.trustpilotReviewUrl;
  const trustpilotConfigured = items.some((item) =>
    (drafts[item.id] ?? item).enabled
      && ((drafts[item.id] ?? item).name.toLowerCase().includes('trustpilot') || (drafts[item.id] ?? item).href === trustpilotUrl),
  ) || newItem.name.toLowerCase().includes('trustpilot') || newItem.href === trustpilotUrl;
  const previewItems = [
    ...items.map((item) => ({ ...item, ...(drafts[item.id] ?? {}) })),
    ...(newItem.name.trim() && newItem.href.trim() && newFiles.objectPath ? [{
      id: 'preview-new-social-item',
      group: view === 'all' ? newItem.group : view,
      name: newItem.name,
      href: newItem.href,
      objectPath: 'new-social-objectPath',
      lightObjectPath: newFiles.lightObjectPath ? 'new-social-lightObjectPath' : null,
      darkObjectPath: newFiles.darkObjectPath ? 'new-social-darkObjectPath' : null,
      appearance: newFiles.lightObjectPath || newFiles.darkObjectPath ? 'separate' as const : 'same' as const,
      displayMode: newItem.displayMode,
      enabled: true,
      sortOrder: Number.MAX_SAFE_INTEGER,
      createdAt: new Date(0).toISOString(),
    } as SocialTrustItem] : []),
    ...(trustpilotUrl && !trustpilotConfigured ? [{
      id: 'preview-trustpilot-fallback',
      group: 'trust',
      name: 'Trustpilot',
      href: trustpilotUrl,
      objectPath: null,
      lightObjectPath: null,
      darkObjectPath: null,
      appearance: 'auto' as const,
      displayMode: 'icon-name' as const,
      enabled: true,
      sortOrder: Number.MAX_SAFE_INTEGER,
      createdAt: new Date(0).toISOString(),
    } as SocialTrustItem] : []),
  ];
  const previewAssets: Record<string, string> = {};
  for (const item of previewItems) for (const path of [item.objectPath, item.lightObjectPath, item.darkObjectPath]) {
    if (path && item.id !== 'preview-new-social-item') previewAssets[path] = `${basePath}/api/admin/social-trust/items/${item.id}/preview?objectPath=${encodeURIComponent(path)}`;
  }
  Object.assign(previewAssets, localPreview.assets, uploadedPreviews);
  const telegramInput = normalizeTelegramSupportInput(telegramUrl);
  const telegramSupportPreview: TelegramSupportPreviewSnapshot = !initialized || !query.data
    ? { status: query.isError ? 'error' : 'unresolved' }
    : telegramInput.error
      ? { status: 'invalid' }
      : telegramInput.value
        ? { status: 'configured', value: telegramInput.value }
        : { status: 'confirmed-empty' };
  const socialTrust = {
    socialTitle: titles.socialTitle, trustTitle: titles.trustTitle,
    instagramUrl: query.data?.instagramUrl ?? null,
    xUrl: query.data?.xUrl ?? null,
    facebookUrl: query.data?.facebookUrl ?? null,
    telegramUrl: initialized ? telegramUrl.trim() || null : undefined,
    appearance, trustAppearance,
    socialTitleVisible: appearance.socialTitleVisible ?? true,
    trustTitleVisible: trustAppearance.trustTitleVisible ?? true,
    trustTitleFontSize: trustAppearance.titleFontSize ?? 18,
    trustTitleAlignment: trustAppearance.titleAlignment ?? 'left',
    items: previewItems,
  };
  const telegramPreviewUrl = telegramInput.error
    ? null
    : telegramInput.value ?? resolvePublishedTelegramSupportUrl(null);
  return <section className="social-trust-editor" data-view={view} data-testid="social-trust-editor">
    <div className="st-panel">
      <div className="st-panel-head"><div><span className="st-kicker">01 / Section settings</span><h2>{heading}</h2><p>{description}</p></div></div>
      <div className="st-panel-body">
      {query.isLoading && <div className="st-loading" role="status" aria-label="Loading section settings"><span /><span /><span /><span /></div>}
      {query.isError && <InlineNotice kind="error">Unable to load section settings: {apiErrorText(query.error, 'Please try again.')} <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></InlineNotice>}
      {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}
      <div className="st-settings-grid">
        {view !== 'trust' && <div className="st-settings-block">
          {view === 'all' && <h3 className="st-section-label">Social Media <span>Icon controls</span></h3>}
          <div className="st-title-row"><label className="st-field-label">Section title<input className="admin-input w-full" value={titles.socialTitle} onChange={(e) => setTitles({ ...titles, socialTitle: e.target.value })} aria-label="Social Media section title" /></label>
          <label className="st-toggle"><input type="checkbox" checked={appearance.socialTitleVisible ?? true} onChange={(e) => setAppearance({ ...appearance, socialTitleVisible: e.target.checked })} /> Show title</label></div>
          <label className="st-field-label mt-4 block">Telegram Support Username / URL
            <input
              className="admin-input mt-1 w-full"
              value={telegramUrl}
              onChange={(e) => setTelegramUrl(e.target.value)}
              placeholder="@username or https://t.me/username"
              aria-label="Telegram Support Username / URL"
              aria-invalid={Boolean(telegramInput.error)}
              aria-describedby="telegram-support-help telegram-support-error"
              data-testid="input-telegram-support-url"
            />
          </label>
          <p id="telegram-support-help" className="mt-1 text-xs text-muted-foreground">
            Enter an @username or Telegram profile URL. A blank draft uses the historical default until you replace it and publish.
          </p>
          {telegramInput.error && <p id="telegram-support-error" className="mt-1 text-xs text-destructive" role="alert" data-testid="text-telegram-support-error">{telegramInput.error}</p>}
          {telegramPreviewUrl && <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="telegram-support-destination-preview">
            <span>Final destination{!telegramInput.value ? ' · historical default' : ''}:</span>
            <a className="font-semibold text-primary underline underline-offset-2" href={telegramPreviewUrl} target="_blank" rel="noreferrer noopener">
              {telegramSupportHandle(telegramPreviewUrl)}
            </a>
          </p>}
          <div className="st-control-group"><p className="st-control-title">Title & icon appearance</p><div className="st-controls">
            <FieldNumber label="Title font size" value={appearance.titleFontSize ?? 18} min={12} max={40} onChange={(titleFontSize) => setAppearance({ ...appearance, titleFontSize })} />
            <Select label="Title alignment" value={appearance.titleAlignment ?? 'left'} options={['left', 'center', 'right']} onChange={(titleAlignment) => setAppearance({ ...appearance, titleAlignment: titleAlignment as SocialIconAppearance['titleAlignment'] })} />
            <FieldNumber label="Icon size" value={appearance.iconSize} min={8} max={48} onChange={(iconSize) => setAppearance({ ...appearance, iconSize })} />
            <FieldNumber label="Circle size" value={appearance.circleSize} min={24} max={80} onChange={(circleSize) => setAppearance({ ...appearance, circleSize })} />
            <FieldNumber label="Icon spacing" value={appearance.spacing ?? 14} min={0} max={80} onChange={(spacing) => setAppearance({ ...appearance, spacing })} />
            <Select label="Alignment" value={appearance.alignment ?? 'left'} options={['left', 'center', 'right']} onChange={(alignment) => setAppearance({ ...appearance, alignment: alignment as SocialIconAppearance['alignment'] })} />
            <Select label="Circle radius" value={appearance.radiusMode} options={['circle', 'rounded', 'square']} onChange={(radiusMode) => setAppearance({ ...appearance, radiusMode: radiusMode as SocialIconAppearance['radiusMode'] })} />
            <Select label="Hover animation" value={appearance.hoverAnimation ?? 'lift'} options={['none', 'lift', 'scale', 'glow']} onChange={(hoverAnimation) => setAppearance({ ...appearance, hoverAnimation: hoverAnimation as SocialIconAppearance['hoverAnimation'] })} />
            <ColorField label="Background color" value={appearance.backgroundColor} onChange={(backgroundColor) => setAppearance({ ...appearance, backgroundColor })} />
            <ColorField label="Border color" value={appearance.borderColor} onChange={(borderColor) => setAppearance({ ...appearance, borderColor })} />
            <FieldNumber label="Border thickness" value={appearance.borderThickness} min={0} max={8} onChange={(borderThickness) => setAppearance({ ...appearance, borderThickness })} />
            <FieldNumber label="Glow intensity" value={appearance.glowIntensity} min={0} max={100} onChange={(glowIntensity) => setAppearance({ ...appearance, glowIntensity })} />
          </div></div>
          <label className="st-depth text-xs font-medium" htmlFor="social-depth-range">
            <span className="flex justify-between gap-3"><span>Social icon depth</span><output htmlFor="social-depth-range">{appearance.depthIntensity ?? 45}%</output></span>
            <input id="social-depth-range" data-testid="input-social-depth-range" className="mt-3 w-full accent-primary" type="range" min="0" max="100" value={appearance.depthIntensity ?? 45} onChange={(e) => setAppearance({ ...appearance, depthIntensity: Number(e.target.value) })} />
            <span className="mt-1 block font-normal text-muted-foreground">Controls the landing icon’s inset reflection and soft shadow. Zero is flat; 100 has the most depth.</span>
          </label>
        </div>}
        {view !== 'social' && <div className="st-settings-block">
          {view === 'all' && <h3 className="st-section-label">Feedback / Trust <span>Review controls</span></h3>}
          <div className="st-title-row"><label className="st-field-label">Section title<input className="admin-input w-full" value={titles.trustTitle} onChange={(e) => setTitles({ ...titles, trustTitle: e.target.value })} aria-label="Feedback / Trust section title" /></label>
          <label className="st-toggle"><input type="checkbox" checked={trustAppearance.trustTitleVisible ?? true} onChange={(e) => setTrustAppearance({ ...trustAppearance, trustTitleVisible: e.target.checked })} /> Show title</label></div>
          <div className="st-control-group"><p className="st-control-title">Title & logo appearance</p><div className="st-controls">
            <FieldNumber label="Title font size" value={trustAppearance.titleFontSize ?? 18} min={12} max={40} onChange={(titleFontSize) => setTrustAppearance({ ...trustAppearance, titleFontSize })} />
            <Select label="Title alignment" value={trustAppearance.titleAlignment ?? 'left'} options={['left', 'center', 'right']} onChange={(titleAlignment) => setTrustAppearance({ ...trustAppearance, titleAlignment: titleAlignment as SocialIconAppearance['titleAlignment'] })} />
            <Select label="Layout" value={trustAppearance.layout ?? 'horizontal'} options={['horizontal', 'centered', 'vertical', 'grid']} onChange={(layout) => setTrustAppearance({ ...trustAppearance, layout: layout as SocialIconAppearance['layout'] })} />
            <FieldNumber label="Logo size" value={trustAppearance.logoSize} min={20} max={100} onChange={(logoSize) => setTrustAppearance({ ...trustAppearance, logoSize })} />
            <FieldNumber label="Logo spacing" value={trustAppearance.spacing ?? 14} min={0} max={80} onChange={(spacing) => setTrustAppearance({ ...trustAppearance, spacing })} />
            <Select label="Container" value={trustAppearance.container ?? 'none'} options={['none', 'subtle', 'glow']} onChange={(container) => setTrustAppearance({ ...trustAppearance, container: container as SocialIconAppearance['container'] })} />
            <Select label="Logo alignment" value={trustAppearance.alignment ?? 'left'} options={['left', 'center', 'right']} onChange={(alignment) => setTrustAppearance({ ...trustAppearance, alignment: alignment as SocialIconAppearance['alignment'] })} />
            <ColorField label="Background color" value={trustAppearance.backgroundColor} onChange={(backgroundColor) => setTrustAppearance({ ...trustAppearance, backgroundColor })} />
            <FieldNumber label="Border thickness" value={trustAppearance.borderThickness} min={0} max={8} onChange={(borderThickness) => setTrustAppearance({ ...trustAppearance, borderThickness })} />
            <ColorField label="Border color" value={trustAppearance.borderColor} onChange={(borderColor) => setTrustAppearance({ ...trustAppearance, borderColor })} />
            <FieldNumber label="Glow intensity" value={trustAppearance.glowIntensity} min={0} max={100} onChange={(glowIntensity) => setTrustAppearance({ ...trustAppearance, glowIntensity })} />
          </div></div>
        </div>}
      </div>
      <div className="st-actions"><button type="button" className="button button-primary" onClick={() => void saveStyle()} disabled={!initialized || !query.data || saveSocial.isPending || saveTitles.isPending}><Save size={15} /> Save section settings</button><span>Saved changes remain drafts until the site snapshot is published.</span></div>
      </div>
    </div>

    <div className="st-panel">
      <div className="st-panel-head"><div><span className="st-kicker">02 / New destination</span><h3>Add {view === 'social' ? 'social platform' : view === 'trust' ? 'review platform' : 'social or review platform'}</h3><p>Add an official profile URL and primary icon. Light- and dark-mode artwork can override the primary file.</p></div></div>
      <div className="st-panel-body">
      {query.isError && <InlineNotice kind="error">Unable to load existing platforms: {apiErrorText(query.error, 'Please retry loading the list.')}</InlineNotice>}
      <div className="st-create-fields">
        <label className="st-field-label">Platform name<input className="admin-input w-full" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Instagram" aria-label="Platform Name" /></label>
        <label className="st-field-label">Profile URL<input className="admin-input w-full" value={newItem.href} onChange={(e) => setNewItem({ ...newItem, href: e.target.value })} placeholder="https://your-profile-url" aria-label="Social profile URL" /></label>
        {view === 'all' && <Select label="Section" value={newItem.group} options={['social', 'trust']} optionLabels={{ trust: 'Review' }} onChange={(group) => setNewItem({ ...newItem, group: group as 'social' | 'trust' })} />}
        <Select label="Display mode" value={newItem.displayMode} options={['icon-only', 'icon-name']} onChange={(displayMode) => setNewItem({ ...newItem, displayMode: displayMode as 'icon-only' | 'icon-name' })} />
      </div>
      <div className="st-file-grid">{([
        ['objectPath', 'Primary logo / icon (required)'], ['lightObjectPath', 'Optional light-mode logo'], ['darkObjectPath', 'Optional dark-mode logo'],
      ] as const).map(([key, label]) => <FilePicker key={key} label={label} value={newFiles[key]} onChange={(file) => setNewFiles((current) => ({ ...current, [key]: file }))} />)}</div>
      <div className="st-actions"><button type="button" className="button button-primary" onClick={() => void addItem()} disabled={upload.isPending || create.isPending || query.isError || !query.data}><ImagePlus size={15} /> Save icon item</button><span>Icon Only hides the name beside the uploaded artwork. New entries save as drafts.</span></div>
      {createNotice && <InlineNotice kind={createNotice.kind}>{createNotice.text}</InlineNotice>}
      </div>
    </div>

    <div className="grid gap-4">
      {visibleGroups.map((group) => <div className="st-panel" key={group}>
        <div className="st-panel-head"><div><span className="st-kicker">03 / Saved destinations</span><h3>{group === 'social' ? 'Social icons' : 'Review platforms'} <span className="st-hint">({items.filter((item) => item.group === group).length})</span></h3><p>Manage links, artwork, visibility and display order. Save each item after editing.</p></div></div>
        <div className="st-panel-body st-items">
        {items.filter((item) => item.group === group).map((item) => {
          const draft = drafts[item.id] ?? { ...item };
          const groupItems = items.filter((entry) => entry.group === group);
          const index = groupItems.findIndex((entry) => entry.id === item.id);
          return <article key={item.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
            e.preventDefault();
            const source = items.find((entry) => entry.id === dragId.current);
            if (source) void changeGroupOrder(source, item);
            dragId.current = null;
          }} className="st-item" data-testid={`card-social-trust-${item.id}`}>
              <div className="st-item-top"><button type="button" draggable onDragStart={(e) => { dragId.current = item.id; e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { dragId.current = null; }} onKeyDown={(e) => {
               if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
               e.preventDefault();
               const target = groupItems[index + (e.key === 'ArrowUp' ? -1 : 1)];
               if (target) void changeGroupOrder(item, target);
             }} className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing" title="Drag to reorder; use arrow keys to move" aria-label={`Reorder ${item.name}. Drag or press Up or Down arrow keys.`} data-testid={`button-reorder-social-${item.id}`}><GripVertical size={16} aria-hidden="true" /></button>
                <div className="st-item-identity">{draft.objectPath && <img src={uploadedPreviews[draft.objectPath] ?? `${basePath}/api/admin/social-trust/items/${item.id}/preview?objectPath=${encodeURIComponent(draft.objectPath)}`} alt={`${draft.name} logo`} />}
                <div className="min-w-0"><strong>{draft.name}</strong><a href={draft.href} target="_blank" rel="noopener noreferrer">{draft.href}</a></div></div>
               <label className="st-toggle"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDrafts({ ...drafts, [item.id]: { ...draft, enabled: e.target.checked } })} /> Visible</label>
               <button type="button" className="button button-secondary h-7 px-2 text-xs" aria-label={`Save changes to ${item.name}`} onClick={() => void saveItem(item)} disabled={!drafts[item.id] || update.isPending}><Save size={13} /> Save</button>
                <button type="button" className="button button-secondary h-7 px-2 text-xs text-destructive" aria-label={`Delete ${item.name}`} onClick={() => { if (window.confirm(`Delete ${item.name}? This removes the draft item and cannot be undone.`)) remove.mutate({ id: item.id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() }), onError: (error) => setItemNotices((current) => ({ ...current, [item.id]: { kind: 'error', text: apiErrorText(error, 'Unable to delete this item.') } })) }); }} disabled={remove.isPending}><Trash2 size={13} /> Delete</button>
            </div>
             {itemNotices[item.id] && <InlineNotice kind={itemNotices[item.id].kind}>{itemNotices[item.id].text}</InlineNotice>}
             <div className="st-item-controls">
               <label className="st-field-label">Platform name<input className="admin-input w-full" value={draft.name} onChange={(e) => setDrafts({ ...drafts, [item.id]: { ...draft, name: e.target.value } })} aria-label="Platform Name" /></label>
               <label className="st-field-label">Profile URL<input className="admin-input w-full" value={draft.href} onChange={(e) => setDrafts({ ...drafts, [item.id]: { ...draft, href: e.target.value } })} aria-label="Profile URL" /></label>
              <Select label="Display mode" value={draft.displayMode} options={['icon-only', 'icon-name']} onChange={(displayMode) => setDrafts({ ...drafts, [item.id]: { ...draft, displayMode: displayMode as 'icon-only' | 'icon-name' } })} />
              <Select label="Logo appearance" value={draft.appearance ?? 'auto'} options={['auto', 'same', 'separate']} onChange={(value) => setDrafts({ ...drafts, [item.id]: { ...draft, appearance: value as 'auto' | 'same' | 'separate' } })} />
            </div>
             <div className="st-item-files">{([
              ['objectPath', 'Replace primary logo'], ['lightObjectPath', 'Light-mode logo'], ['darkObjectPath', 'Dark-mode logo'],
            ] as const).map(([key, label]) => <ItemFilePicker
              key={key}
              label={label}
              previewUrl={draft[key] ? uploadedPreviews[draft[key] as string] ?? `${basePath}/api/admin/social-trust/items/${item.id}/preview?objectPath=${encodeURIComponent(draft[key] as string)}` : null}
              onUpload={async (file) => {
              try {
                const path = await uploadOne(file);
                const localUrl = URL.createObjectURL(file);
                const previousUrl = uploadedPreviewsRef.current[path];
                if (previousUrl) URL.revokeObjectURL(previousUrl);
                uploadedPreviewsRef.current[path] = localUrl;
                setUploadedPreviews((current) => ({ ...current, [path]: localUrl }));
                setDrafts((current) => ({ ...current, [item.id]: { ...draft, [key]: path } }));
              }
              catch (error) { setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to upload logo.') }); }
            }} />)}</div>
          </article>;
        })}
         {!items.some((item) => item.group === group) && !query.isLoading && <div className="st-empty"><strong>No {group === 'social' ? 'social links' : 'review platforms'} yet</strong><p>Use the form above to add your first destination.</p></div>}
         {items.some((item) => item.group === group) && <p className="st-hint">Drag the handle or focus it and use Up / Down to reorder. Save each entry after editing.</p>}
        </div>
      </div>)}
    </div>

    <div className="st-panel st-preview">
       <div className="st-panel-head"><div><span className="st-kicker">04 / Live preview</span><h3 className="flex items-center gap-2"><Eye size={16} /> {heading} footer preview</h3><p>Draft changes appear here before publishing. Switch device and theme in the preview toolbar.</p></div></div>
       <div className="st-preview-frame"><LivePreviewFrame draftState={{ pageKey: 'home', socialTrust, telegramSupportPreview, assetUrls: previewAssets }} /></div>
    </div>
  </section>;
}

function FieldNumber({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="st-field-label">{label}<input className="admin-input" type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))} /></label>;
}
function Select({ label, value, options, optionLabels, onChange }: { label: string; value: string; options: string[]; optionLabels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="st-field-label">{label}<select className="admin-input" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option} value={option}>{optionLabels?.[option] ?? option.replace('-', ' ').replace(/^\w/, (letter) => letter.toUpperCase())}</option>)}</select></label>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="st-field-label">{label}<input className="admin-input h-9 p-1" type="color" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function FilePicker({ label, value, onChange }: { label: string; value?: File; onChange: (file?: File) => void }) {
  return <label className="st-file">{label}<input type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0])} />{value && <span className="mt-1 block truncate text-muted-foreground">{value.name}</span>}</label>;
}
function ItemFilePicker({ label, previewUrl, onUpload }: { label: string; previewUrl?: string | null; onUpload: (file: File) => void }) {
  return <label className="st-file">{label}{previewUrl && <img src={previewUrl} alt="" />}<input type="file" accept={accept} onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); }} /></label>;
}