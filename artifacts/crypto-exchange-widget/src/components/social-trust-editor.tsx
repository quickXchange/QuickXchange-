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
import { useQuery } from '@tanstack/react-query';
import { apiErrorText, queryClient } from '../App';
import { basePath, InlineNotice } from './shared-app-ui';
import { LivePreviewFrame } from './live-preview-frame';

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

export function SocialTrustEditor() {
  const query = useGetAdminSocialTrust({ query: { queryKey: getGetAdminSocialTrustQueryKey(), staleTime: 0 } });
  const notificationSettings = useGetPublicNotificationSettings();
  const upload = useRequestSocialTrustIconUpload();
  const create = useCreateAdminSocialTrustItem();
  const update = useUpdateAdminSocialTrustItem();
  const remove = useRemoveAdminSocialTrustItem();
  const saveSocial = useUpdateAdminSocialMedia();
  const saveTitles = useUpdateAdminSocialTrustTitles();
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [titles, setTitles] = useState({ socialTitle: 'Stay connected with us', trustTitle: 'Share your feedback with us' });
  const [appearance, setAppearance] = useState<SocialIconAppearance>(DEFAULT_APPEARANCE);
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
    setAppearance({ ...DEFAULT_APPEARANCE, ...query.data.appearance });
    setTrustAppearance({ ...DEFAULT_APPEARANCE, ...query.data.trustAppearance });
    setInitialized(true);
  }, [query.data, initialized]);

  const items = useMemo(() => [...(query.data?.items ?? [])].sort((a, b) =>
    a.group.localeCompare(b.group) || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)), [query.data?.items]);

  const uploadOne = async (file: File) => {
    const contentType = fileType(file);
    if (!contentType || file.size > 5 * 1024 * 1024) throw new Error('Choose an SVG, PNG, WebP, JPG, or JPEG file up to 5 MB.');
    const intent = await upload.mutateAsync({ data: { contentType } });
    const response = await fetch(intent.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
    if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
    return intent.objectPath;
  };

  const addItem = async () => {
    if (!newItem.name.trim() || !newItem.href.trim()) return setNotice({ kind: 'error', text: 'Platform name and profile URL are required.' });
    if (!newFiles.objectPath) return setNotice({ kind: 'error', text: 'Upload the icon that should appear on your website.' });
    try {
      const [objectPath, lightObjectPath, darkObjectPath] = await Promise.all([
        uploadOne(newFiles.objectPath),
        newFiles.lightObjectPath ? uploadOne(newFiles.lightObjectPath) : Promise.resolve(null),
        newFiles.darkObjectPath ? uploadOne(newFiles.darkObjectPath) : Promise.resolve(null),
      ]);
      await create.mutateAsync({ data: {
        group: newItem.group, name: newItem.name.trim(), href: newItem.href.trim(),
        objectPath, lightObjectPath, darkObjectPath, appearance: lightObjectPath || darkObjectPath ? 'separate' : 'same',
        displayMode: newItem.displayMode, enabled: true,
      } });
      setNewItem((current) => ({ ...current, name: '', href: '' }));
      setNewFiles({});
      setNotice({ kind: 'success', text: 'Social / review item saved as a draft. Publish the site snapshot when ready.' });
      await queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
    } catch (error) { setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save this item.') }); }
  };

  const saveItem = async (item: SocialTrustItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    try {
      await update.mutateAsync({ id: item.id, data: draft });
      setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
      setNotice({ kind: 'success', text: 'Item saved as a draft.' });
      await queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
    } catch (error) { setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to save this item.') }); }
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
    try {
      await Promise.all([
        saveTitles.mutateAsync({ data: titles }),
        saveSocial.mutateAsync({ data: {
          instagramUrl: query.data?.instagramUrl ?? null, xUrl: query.data?.xUrl ?? null,
          facebookUrl: query.data?.facebookUrl ?? null, telegramUrl: query.data?.telegramUrl ?? null,
          appearance, trustAppearance,
        } }),
      ]);
      await queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() });
      setNotice({ kind: 'success', text: 'Feedback and social settings saved as a draft.' });
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
      group: newItem.group,
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
  const socialTrust = {
    socialTitle: titles.socialTitle, trustTitle: titles.trustTitle,
    instagramUrl: query.data?.instagramUrl ?? null, xUrl: query.data?.xUrl ?? null,
    facebookUrl: query.data?.facebookUrl ?? null, telegramUrl: query.data?.telegramUrl ?? null,
    appearance, trustAppearance,
    socialTitleVisible: appearance.socialTitleVisible ?? true,
    trustTitleVisible: trustAppearance.trustTitleVisible ?? true,
    trustTitleFontSize: trustAppearance.titleFontSize ?? 18,
    trustTitleAlignment: trustAppearance.titleAlignment ?? 'left',
    items: previewItems,
  };
  return <section className="space-y-5" data-testid="social-trust-editor">
    <div className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Social Media & Feedback / Trust</h2><p className="text-sm text-muted-foreground">Uploaded artwork stays unchanged. Icon Only is the default public display.</p></div><button type="button" className="button button-primary" onClick={() => void saveStyle()} disabled={saveSocial.isPending || saveTitles.isPending}><Save size={15} /> Save section settings</button></div>
      {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4 space-y-3">
          <h3 className="font-semibold">Social Media</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={appearance.socialTitleVisible ?? true} onChange={(e) => setAppearance({ ...appearance, socialTitleVisible: e.target.checked })} /> Show section title</label>
          <input className="admin-input w-full" value={titles.socialTitle} onChange={(e) => setTitles({ ...titles, socialTitle: e.target.value })} aria-label="Social Media section title" />
          <div className="grid grid-cols-2 gap-2">
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
          </div>
        </div>
        <div className="rounded-xl border border-border p-4 space-y-3">
          <h3 className="font-semibold">Feedback / Trust</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trustAppearance.trustTitleVisible ?? true} onChange={(e) => setTrustAppearance({ ...trustAppearance, trustTitleVisible: e.target.checked })} /> Show title</label>
          <input className="admin-input w-full" value={titles.trustTitle} onChange={(e) => setTitles({ ...titles, trustTitle: e.target.value })} aria-label="Feedback / Trust section title" />
          <div className="grid grid-cols-2 gap-2">
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
          </div>
        </div>
      </div>
    </div>

    <div className="panel space-y-4 p-5">
      <h3 className="font-semibold">Add social or review platform</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Section" value={newItem.group} options={['social', 'trust']} onChange={(group) => setNewItem({ ...newItem, group: group as 'social' | 'trust' })} />
        <Select label="Display mode" value={newItem.displayMode} options={['icon-only', 'icon-name']} onChange={(displayMode) => setNewItem({ ...newItem, displayMode: displayMode as 'icon-only' | 'icon-name' })} />
        <input className="admin-input w-full" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Platform name (admin identification)" aria-label="Platform Name" />
        <input className="admin-input w-full" value={newItem.href} onChange={(e) => setNewItem({ ...newItem, href: e.target.value })} placeholder="https://your-profile-url" aria-label="Social profile URL" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">{([
        ['objectPath', 'Primary logo / icon (required)'], ['lightObjectPath', 'Optional light-mode logo'], ['darkObjectPath', 'Optional dark-mode logo'],
      ] as const).map(([key, label]) => <FilePicker key={key} label={label} value={newFiles[key]} onChange={(file) => setNewFiles((current) => ({ ...current, [key]: file }))} />)}</div>
      <div className="flex flex-wrap gap-2"><button type="button" className="button button-primary" onClick={() => void addItem()} disabled={upload.isPending || create.isPending}><ImagePlus size={15} /> Save icon item</button><span className="self-center text-xs text-muted-foreground">Icon Only never shows the platform name beside the uploaded logo.</span></div>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      {(['social', 'trust'] as const).map((group) => <div className="panel space-y-2 p-4" key={group}>
        <h3 className="font-semibold">{group === 'social' ? 'Social icons' : 'Review platforms'}</h3>
        {items.filter((item) => item.group === group).map((item) => {
          const draft = drafts[item.id] ?? { ...item };
          return <article key={item.id} draggable onDragStart={() => { dragId.current = item.id; }} onDragOver={(e) => e.preventDefault()} onDrop={() => {
            const source = items.find((entry) => entry.id === dragId.current);
            if (source) void changeGroupOrder(source, item);
            dragId.current = null;
          }} className="rounded-lg border border-border bg-card p-3 space-y-2" data-testid={`card-social-trust-${item.id}`}>
            <div className="flex items-center gap-2"><GripVertical size={16} className="cursor-grab text-muted-foreground" /><strong className="flex-1 truncate text-sm">{item.name}</strong>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDrafts({ ...drafts, [item.id]: { ...draft, enabled: e.target.checked } })} /> Visible</label>
              <button type="button" className="button button-secondary h-7 px-2 text-xs" onClick={() => void saveItem(item)}><Save size={13} /></button>
              <button type="button" className="button button-secondary h-7 px-2 text-xs text-destructive" onClick={() => remove.mutate({ id: item.id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetAdminSocialTrustQueryKey() }) })}><Trash2 size={13} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="admin-input w-full" value={draft.name} onChange={(e) => setDrafts({ ...drafts, [item.id]: { ...draft, name: e.target.value } })} aria-label="Platform Name" />
              <input className="admin-input w-full" value={draft.href} onChange={(e) => setDrafts({ ...drafts, [item.id]: { ...draft, href: e.target.value } })} aria-label="Profile URL" />
              <Select label="Display mode" value={draft.displayMode} options={['icon-only', 'icon-name']} onChange={(displayMode) => setDrafts({ ...drafts, [item.id]: { ...draft, displayMode: displayMode as 'icon-only' | 'icon-name' } })} />
              <Select label="Logo appearance" value={draft.appearance ?? 'auto'} options={['auto', 'same', 'separate']} onChange={(value) => setDrafts({ ...drafts, [item.id]: { ...draft, appearance: value as 'auto' | 'same' | 'separate' } })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">{([
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
        {!items.some((item) => item.group === group) && <p className="text-sm text-muted-foreground">No {group === 'social' ? 'social links' : 'review platforms'} yet.</p>}
      </div>)}
    </div>

    <div className="panel h-[720px] p-0">
      <div className="flex items-center gap-2 border-b border-border p-3"><Eye size={16} /><strong className="text-sm">Exact landing-page footer preview</strong><span className="text-xs text-muted-foreground">Choose desktop/tablet/mobile and light/dark above.</span></div>
      <div className="h-[calc(100%-48px)]"><LivePreviewFrame draftState={{ pageKey: 'home', socialTrust, assetUrls: previewAssets }} /></div>
    </div>
  </section>;
}

function FieldNumber({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-xs font-medium">{label}<input className="admin-input mt-1 w-full" type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))} /></label>;
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium">{label}<select className="admin-input mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replace('-', ' ').replace(/^\w/, (letter) => letter.toUpperCase())}</option>)}</select></label>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium">{label}<input className="admin-input mt-1 h-9 w-full p-1" type="color" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function FilePicker({ label, value, onChange }: { label: string; value?: File; onChange: (file?: File) => void }) {
  return <label className="block rounded-lg border border-dashed border-border p-3 text-xs font-medium">{label}<input className="mt-2 block w-full text-xs" type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0])} />{value && <span className="mt-1 block truncate text-muted-foreground">{value.name}</span>}</label>;
}
function ItemFilePicker({ label, previewUrl, onUpload }: { label: string; previewUrl?: string | null; onUpload: (file: File) => void }) {
  return <label className="block rounded-lg border border-dashed border-border p-2 text-xs">{label}{previewUrl && <img className="mt-2 h-10 w-full rounded object-contain" src={previewUrl} alt="" />}<input className="mt-1 block w-full" type="file" accept={accept} onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); }} /></label>;
}