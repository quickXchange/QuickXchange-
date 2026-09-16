import React, { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminLandingBackground,
  getGetAdminLandingBackgroundQueryKey,
  usePublishLandingBackground,
  useRequestLandingBackgroundUpload,
  getGetLandingBackgroundQueryKey
} from '@workspace/api-client-react';
import type { LandingBackgroundUploadInputContentType, LandingBackgroundMode, LandingBackgroundPublishInput } from '@workspace/api-client-react';
import {
  AdminShell,
  ErrorState,
  LoadingBlock,
  apiErrorText,
  InlineNotice
} from '../App';
import { LandingBackgroundView } from '../components/landing-background';
import {
  getLandingBackgroundUrl,
  getLandingBackgroundPlacement,
  getLandingBackgroundSourceKey,
  DEFAULT_LANDING_BACKGROUND_PLACEMENT,
  type LandingBackgroundSelection,
  type LandingBackgroundPlacement,
} from '../lib/landing-background-config';
import { Check, Image as ImageIcon, Upload, Loader2, Maximize, Grip, Smartphone } from 'lucide-react';
import { useI18n } from '../i18n/provider';
import { BrandLogo } from '../components/brand-logo'
import { useAppTheme } from '../theme';
import { useAdminPermissions } from '../lib/admin-permissions';

const PRESETS = [
  { id: 'neon-orbit', nameKey: 'presetNeonOrbit' },
  { id: 'crystal-ledger', nameKey: 'presetCrystalLedger' },
  { id: 'quantum-grid', nameKey: 'presetQuantumGrid' },
  { id: 'liquid-token', nameKey: 'presetLiquidToken' },
  { id: 'aurora-chain', nameKey: 'presetAuroraChain' },
  { id: 'prism-vault', nameKey: 'presetPrismVault' },
  { id: 'network-bloom', nameKey: 'presetNetworkBloom' },
  { id: 'electric-canyon', nameKey: 'presetElectricCanyon' },
  { id: 'cosmic-exchange', nameKey: 'presetCosmicExchange' },
  { id: 'blueprint-future', nameKey: 'presetBlueprintFuture' }
] as const;

export function AdminLandingBackgroundStudio() {
  const { can } = useAdminPermissions();
  const canManage = can('site_settings.manage');
  const { t, formatDate, formatNumber } = useI18n();
  const isDark = useAppTheme();
  const queryClient = useQueryClient();
  const queryKey = getGetAdminLandingBackgroundQueryKey();

  const { data: currentBg, isLoading, isError, refetch } = useGetAdminLandingBackground({
    query: { queryKey, staleTime: 0 }
  });

  const publishMutation = usePublishLandingBackground();
  const requestUpload = useRequestLandingBackgroundUpload();

  const [draft, setDraft] = useState<LandingBackgroundSelection>({
    mode: 'preset',
    presetId: 'neon-orbit',
    focalX: 50,
    focalY: 50,
    placements: {}
  });

  const [localCustomPreview, setLocalCustomPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ status: 'idle' | 'uploading' | 'done' | 'error', message?: string }>({ status: 'idle' });
  const [publishNotice, setPublishNotice] = useState<{ kind: 'success' | 'error', text: string } | null>(null);
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'mobile'>('desktop');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (currentBg) {
      const response = currentBg;
      const activeKey = response.mode === 'custom' ? response.customObjectPath || '' : response.presetId || 'neon-orbit';
      const fallback = {
        desktop: response.desktopPlacement || { x: response.focalX, y: response.focalY, zoom: 100, opacity: 100, blur: 0 },
        mobile: response.mobilePlacement || { x: response.focalX, y: response.focalY, zoom: 100, opacity: 100, blur: 0 },
      };
      setDraft({
        mode: currentBg.mode as LandingBackgroundMode,
        presetId: currentBg.presetId,
        customObjectPath: currentBg.customObjectPath || null,
        focalX: currentBg.focalX,
        focalY: currentBg.focalY,
        desktopPlacement: response.desktopPlacement
          ? { ...DEFAULT_LANDING_BACKGROUND_PLACEMENT, ...response.desktopPlacement }
          : undefined,
        mobilePlacement: response.mobilePlacement
          ? { ...DEFAULT_LANDING_BACKGROUND_PLACEMENT, ...response.mobilePlacement }
          : undefined,
        placements: { ...response.placements, ...(activeKey ? { [activeKey]: response.placements[activeKey] || fallback } : {}) }
      });
      setLocalCustomPreview(null);
    }
  }, [currentBg]);

  const activeSourceKey = getLandingBackgroundSourceKey(draft);
  const activePlacement = getLandingBackgroundPlacement(draft, devicePreview);
  const updateActivePlacement = (patch: Partial<LandingBackgroundPlacement>) => {
    if (!activeSourceKey) return;
    setDraft(prev => {
      const current = getLandingBackgroundPlacement(prev, devicePreview);
      const placement = { ...current, ...patch };
      return {
        ...prev,
        placements: {
          ...prev.placements,
          [activeSourceKey]: {
            desktop: devicePreview === 'desktop' ? placement : getLandingBackgroundPlacement(prev, 'desktop'),
            mobile: devicePreview === 'mobile' ? placement : getLandingBackgroundPlacement(prev, 'mobile'),
          },
        },
        focalX: devicePreview === 'desktop' ? placement.x : prev.focalX,
        focalY: devicePreview === 'desktop' ? placement.y : prev.focalY,
      };
    });
  };

  // Handle ResizeObserver for exact preview scaling
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (localCustomPreview && localCustomPreview.startsWith('blob:')) {
        URL.revokeObjectURL(localCustomPreview);
      }
    };
  }, [localCustomPreview]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // Always clear input after reading the file so the user can re-select the same file if needed.
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (!file) return;

    if (file.size < 1) {
      setUploadProgress({ status: 'error', message: t('adminBackground.emptyImage') });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadProgress({ status: 'error', message: t('adminBackground.fileTooLarge') });
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadProgress({ status: 'error', message: t('adminBackground.invalidType') });
      return;
    }

    setUploadProgress({ status: 'uploading', message: t('adminBackground.requestingUpload') });

    // Store previous local preview in case of failure
    const prevLocalPreview = localCustomPreview;

    // Create immediate local preview
    const blobUrl = URL.createObjectURL(file);
    setLocalCustomPreview(blobUrl);

    try {
      const uploadIntent = await requestUpload.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type as LandingBackgroundUploadInputContentType
        }
      });

      setUploadProgress({ status: 'uploading', message: t('adminBackground.uploadingImage') });

      const res = await fetch(uploadIntent.uploadURL, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file
      });

      if (!res.ok) throw new Error(t('adminBackground.uploadHttpError', { status: res.statusText }));

      setDraft(prev => ({
        ...prev,
        mode: 'custom',
        customObjectPath: uploadIntent.objectPath,
        placements: {
          ...prev.placements,
          [uploadIntent.objectPath]: prev.placements?.[uploadIntent.objectPath] || {
            desktop: { ...DEFAULT_LANDING_BACKGROUND_PLACEMENT },
            mobile: { ...DEFAULT_LANDING_BACKGROUND_PLACEMENT },
          },
        },
      }));
      if (prevLocalPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(prevLocalPreview);
      }
      setUploadProgress({ status: 'done', message: t('adminBackground.uploadSuccess') });

    } catch (err) {
      setUploadProgress({ status: 'error', message: apiErrorText(err, t('adminBackground.uploadError')) });
      // Revert the local preview so we don't display a blob we can't publish
      if (blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
      setLocalCustomPreview(prevLocalPreview);
    }
  };

  const hasChanges =
    draft.mode !== currentBg?.mode ||
    (draft.mode === 'preset' && draft.presetId !== currentBg?.presetId) ||
    (draft.mode === 'custom' && draft.customObjectPath !== currentBg?.customObjectPath) ||
    JSON.stringify(draft.placements || {}) !== JSON.stringify(currentBg?.placements || {});

  const handlePublish = () => {
    setPublishNotice(null);
    const desktopPlacement = getLandingBackgroundPlacement(draft, 'desktop');
    const placements = Object.fromEntries(
      Object.entries(draft.placements || {}).map(([source, placement]) => [
        source,
        {
          desktop: { ...DEFAULT_LANDING_BACKGROUND_PLACEMENT, ...placement.desktop },
          mobile: { ...DEFAULT_LANDING_BACKGROUND_PLACEMENT, ...placement.mobile },
        },
      ]),
    );
    const payload = (draft.mode === 'preset'
      ? { mode: 'preset' as const, presetId: draft.presetId! }
      : { mode: 'custom' as const, customObjectPath: draft.customObjectPath! });
    const publishData: LandingBackgroundPublishInput = {
      ...payload,
      placements,
      focalX: desktopPlacement.x,
      focalY: desktopPlacement.y,
    };

    publishMutation.mutate({ data: publishData }, {
      onSuccess: () => {
        setPublishNotice({ kind: 'success', text: t('adminBackground.publishSuccess') });
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: getGetLandingBackgroundQueryKey() });
      },
      onError: (err: unknown) => {
        const errorRecord = err && typeof err === 'object'
          ? err as { status?: number; response?: { status?: number }; message?: string }
          : undefined;
        const is403 = errorRecord?.status === 403 ||
          errorRecord?.response?.status === 403 ||
          errorRecord?.message?.includes('403');
        setPublishNotice({
          kind: 'error',
          text: is403
            ? t('adminBackground.ownersOnly')
            : apiErrorText(err, t('adminBackground.publishError'))
        });
      }
    });
  };

  const previewWidth = devicePreview === 'desktop' ? 1440 : 390;
  const previewHeight = devicePreview === 'desktop' ? 900 : 844;
  const scale = containerSize.width > 0 ? Math.min(
    1, // Don't scale up past 1x
    (containerSize.width - 32) / previewWidth,
    (containerSize.height - 32) / previewHeight
  ) : 1;

  return (
    <AdminShell title={t('adminBackground.shellTitle')} eyebrow={t('adminBackground.eyebrow')} requiredPermission="site_settings.view">
      {!canManage ? <div className="panel p-6 text-sm text-muted-foreground" data-testid="landing-background-read-only">You have view-only access to landing settings.</div> : (
      <div className="desk-notes" data-testid="admin-landing-background-studio">
        <div>
          <h2>{t('adminBackground.title')} </h2>
          <p>
            {t('adminBackground.descriptionOne')}{' '}
            {t('adminBackground.descriptionTwo')}
          </p>
        </div>

        {isLoading ? (
          <LoadingBlock rows={6} />
        ) : isError ? (
          <ErrorState message={t('adminBackground.loadError')} retry={() => refetch()} />
        ) : currentBg ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start pb-20">
            {/* Left Column: Controls */}
            <div className="admin-form xl:col-span-7 flex flex-col gap-6">

              {/* Type Selection */}
              <div className="admin-form-card panel p-6">
                <div className="panel-heading mb-4">
                  <div>
                    <h3 className="font-mono text-lg font-bold">{t('adminBackground.sourceTitle')} </h3>
                    <p className="text-muted-foreground text-xs mt-1">{t('adminBackground.sourceDescription')} </p>
                  </div>
                </div>

                <div className="flex gap-4 border-b border-border/50 pb-4 mb-4">
                  <button
                    type="button"
                    data-testid="tab-preset"
                    className={`flex-1 py-3 px-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${draft.mode === 'preset' ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border hover:border-primary/50 text-muted-foreground'}`}
                    onClick={() => setDraft(prev => ({ ...prev, mode: 'preset' }))}
                  >
                    <ImageIcon size={24} />
                    <span className="font-bold text-sm">{t('adminBackground.premiumPresets')} </span>
                  </button>
                  <button
                    type="button"
                    data-testid="tab-custom"
                    className={`flex-1 py-3 px-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${draft.mode === 'custom' ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border hover:border-primary/50 text-muted-foreground'}`}
                    onClick={() => setDraft(prev => ({ ...prev, mode: 'custom' }))}
                  >
                    <Upload size={24} />
                    <span className="font-bold text-sm">{t('adminBackground.customUpload')} </span>
                  </button>
                </div>

                {/* Preset Selector */}
                {draft.mode === 'preset' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-in fade-in duration-200">
                    {PRESETS.map(preset => {
                      const isSelected = draft.presetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          data-testid={`preset-${preset.id}`}
                          className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all group ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-border'}`}
                          onClick={() => setDraft(prev => ({ ...prev, presetId: preset.id }))}
                        >
                          <img
                            src={getLandingBackgroundUrl({ mode: 'preset', presetId: preset.id })}
                            alt={t(`adminBackground.${preset.nameKey}`)}
                            className="w-full h-full object-cover"
                          />
                          <div className={`absolute inset-0 bg-background/50 flex flex-col items-center justify-center p-2 text-center transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <span className="text-[11px] font-bold text-foreground bg-background/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm">{t(`adminBackground.${preset.nameKey}`)}</span>
                            {isSelected && <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-primary-foreground"><Check size={12} /></div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Custom Upload */}
                {draft.mode === 'custom' && (
                  <div className="animate-in fade-in duration-200">
                    <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors relative">
                      <input
                        type="file"
                        ref={fileInputRef}
                        data-testid="upload-custom-input"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label={t('adminBackground.uploadPrompt')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleFileChange}
                      />
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 bg-background rounded-full border shadow-sm flex items-center justify-center text-primary">
                          <Upload size={20} />
                        </div>
                        <div>
                          <strong className="text-foreground block mb-1">{t('adminBackground.uploadPrompt')} </strong>
                          <span className="text-muted-foreground text-xs block">{t('adminBackground.uploadHint')} </span>
                        </div>
                      </div>
                    </div>

                    {uploadProgress.status !== 'idle' && (
                      <div className="mt-4" data-testid="upload-notice">
                        <InlineNotice kind={uploadProgress.status === 'error' ? 'error' : uploadProgress.status === 'done' ? 'success' : 'info'}>
                          <div className="flex items-center gap-2">
                            {uploadProgress.status === 'uploading' && <Loader2 size={14} className="animate-spin" />}
                            <span>{uploadProgress.message}</span>
                          </div>
                        </InlineNotice>
                      </div>
                    )}

                    {draft.customObjectPath && uploadProgress.status !== 'uploading' && (
                      <div className="mt-4 p-4 border rounded-lg bg-background flex items-center gap-3">
                        <div className="w-10 h-10 rounded border overflow-hidden">
                          <img src={getLandingBackgroundUrl({ mode: 'custom', customObjectPath: draft.customObjectPath }, localCustomPreview)} alt={t('adminBackground.customUploadAlt')} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <strong className="block text-sm truncate">{t('adminBackground.currentCustomImage')} </strong>
                          <small className="text-muted-foreground truncate block font-mono">{draft.customObjectPath}</small>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Focal Point Controls */}
              <div className="admin-form-card panel p-6">
                <div className="panel-heading mb-6">
                  <div>
                    <h3 className="font-mono text-lg font-bold">{t('adminBackground.focalTitle')} </h3>
                    <p className="text-muted-foreground text-xs mt-1">{t('adminBackground.focalDescription')} </p>
                  </div>
                </div>

                <div className="flex gap-2 mb-6" data-testid="placement-device-controls">
                  {(['desktop', 'mobile'] as const).map(device => (
                    <button key={device} type="button" data-testid={`placement-${device}-toggle`}
                      onClick={() => setDevicePreview(device)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${devicePreview === device ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {device === 'desktop' ? t('adminBackground.desktop') : t('adminBackground.mobile')}
                    </button>
                  ))}
                </div>
                <div className="admin-form-grid grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="admin-form-field">
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-bold text-foreground">{t('adminBackground.horizontal')} </label>
                      <span className="text-xs font-mono text-muted-foreground">{activePlacement.x}%</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100"
                      value={activePlacement.x}
                      data-testid="focal-x-input"
                      onChange={(e) => updateActivePlacement({ x: parseInt(e.target.value, 10) })}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between gap-1 mt-2">
                      {[[t('adminBackground.left'), 0, 'left'], [t('adminBackground.center'), 50, 'center'], [t('adminBackground.right'), 100, 'right']].map(([name, value, testId]) => <button key={String(name)} type="button" data-testid={`placement-x-${testId}`} onClick={() => updateActivePlacement({ x: Number(value) })} className="text-[10px] text-muted-foreground uppercase font-bold">{name}</button>)}
                    </div>
                  </div>
                  <div className="admin-form-field">
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-bold text-foreground">{t('adminBackground.vertical')} </label>
                      <span className="text-xs font-mono text-muted-foreground">{activePlacement.y}%</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100"
                      value={activePlacement.y}
                      data-testid="focal-y-input"
                      onChange={(e) => updateActivePlacement({ y: parseInt(e.target.value, 10) })}
                      className="w-full accent-primary"
                    />
                    <div className="flex justify-between gap-1 mt-2">
                      {[[t('adminBackground.top'), 0, 'top'], [t('adminBackground.center'), 50, 'center'], [t('adminBackground.bottom'), 100, 'bottom']].map(([name, value, testId]) => <button key={String(name)} type="button" data-testid={`placement-y-${testId}`} onClick={() => updateActivePlacement({ y: Number(value) })} className="text-[10px] text-muted-foreground uppercase font-bold">{name}</button>)}
                    </div>
                  </div>
                  <div className="admin-form-field">
                    <div className="flex justify-between mb-2"><label className="text-sm font-bold text-foreground">{t('adminBackground.zoom')} </label><span className="text-xs font-mono text-muted-foreground">{activePlacement.zoom}%</span></div>
                    <input type="range" min="100" max="150" value={activePlacement.zoom} data-testid="focal-zoom-input" onChange={(e) => updateActivePlacement({ zoom: parseInt(e.target.value, 10) })} className="w-full accent-primary" />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider"><span>100%</span><span>150%</span></div>
                  </div>
                  <div className="admin-form-field">
                    <div className="flex justify-between mb-2"><label className="text-sm font-bold text-foreground">{t('adminBackground.opacity')} </label><span className="text-xs font-mono text-muted-foreground">{activePlacement.opacity}%</span></div>
                    <input type="range" min="0" max="100" value={activePlacement.opacity} data-testid="background-opacity-input" aria-label={t('adminBackground.opacity')} onChange={(e) => updateActivePlacement({ opacity: parseInt(e.target.value, 10) })} className="w-full accent-primary" />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider"><span>0%</span><span>50%</span><span>100%</span></div>
                  </div>
                  <div className="admin-form-field">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <label className="text-sm font-bold text-foreground">{t('adminBackground.blur')} </label>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground" data-testid="background-blur-value">{activePlacement.blur}px</span>
                        <button type="button" data-testid="button-reset-blur" onClick={() => updateActivePlacement({ blur: 0 })} className="text-[10px] text-primary uppercase font-bold">{t('adminBackground.resetBlur')} </button>
                      </div>
                    </div>
                    <input type="range" min="0" max="30" step="1" value={activePlacement.blur} data-testid="background-blur-input" aria-label={t('adminBackground.blur')} onChange={(e) => updateActivePlacement({ blur: parseInt(e.target.value, 10) })} className="w-full accent-primary" />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider"><span>0px</span><span>5px</span><span>10px</span><span>20px</span><span>30px</span></div>
                  </div>
                </div>

                <div
                  className={`mt-6 border border-border rounded-xl overflow-hidden relative group select-none mx-auto ${devicePreview === 'mobile' ? 'w-full max-w-[278px]' : 'w-full'}`}
                  data-testid="focal-map"
                  style={{ aspectRatio: `${previewWidth} / ${previewHeight}` }}
                >
                  <LandingBackgroundView
                    bg={draft}
                    localPreviewUrl={localCustomPreview}
                    previewMode={true}
                    previewDevice={devicePreview}
                  />
                  {/* Focal point indicator */}
                  <div
                    className="absolute w-6 h-6 border-2 border-white rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] bg-primary/80 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-move"
                    style={{ left: `${activePlacement.x}%`, top: `${activePlacement.y}%` }}
                    onPointerDown={(e) => {
                      const container = e.currentTarget.parentElement;
                      if (!container) return;
                      container.setPointerCapture(e.pointerId);
                      const move = (ev: React.PointerEvent) => {
                        const rect = container.getBoundingClientRect();
                        let x = ((ev.clientX - rect.left) / rect.width) * 100;
                        let y = ((ev.clientY - rect.top) / rect.height) * 100;
                        updateActivePlacement({
                          x: Math.round(Math.max(0, Math.min(100, x))),
                          y: Math.round(Math.max(0, Math.min(100, y)))
                        });
                      };
                      const up = () => {
                        container.removeEventListener('pointermove', move as any);
                        container.removeEventListener('pointerup', up);
                      };
                      container.addEventListener('pointermove', move as any);
                      container.addEventListener('pointerup', up);
                    }}
                  >
                    <Grip size={12} className="text-white" />
                  </div>
                  <div className="absolute top-2 left-2 bg-background/80 backdrop-blur text-[10px] font-bold px-2 py-1 rounded">{t('adminBackground.interactiveMap')} </div>
                </div>
              </div>

              {/* Publish Action */}
              <div className="admin-form-card panel p-6 flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-6 z-10 shadow-2xl border-primary/20">
                <div className="flex-1">
                  <strong className="block text-foreground mb-1">
                    {hasChanges ? t('adminBackground.unpublishedChanges') : t('adminBackground.currentlyLive')}
                  </strong>
                  <div className="text-xs text-muted-foreground font-mono">
                    {t('adminBackground.versionPublished', { version: formatNumber(currentBg.version), date: formatDate(currentBg.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    data-testid="button-revert"
                    className="button button-secondary flex-1 sm:flex-none"
                    onClick={() => {
                      setDraft({
                        mode: currentBg.mode as LandingBackgroundMode,
                        presetId: currentBg.presetId,
                        customObjectPath: currentBg.customObjectPath || null,
                        focalX: currentBg.focalX,
                        focalY: currentBg.focalY,
                        desktopPlacement: currentBg.desktopPlacement,
                        mobilePlacement: currentBg.mobilePlacement,
                        placements: { ...currentBg.placements }
                      });
                      setLocalCustomPreview(null);
                      setPublishNotice(null);
                    }}
                    disabled={!hasChanges || publishMutation.isPending}
                  >
                    {t('adminBackground.revert')}
                  </button>
                  <button
                    type="button"
                    data-testid="button-publish"
                    className="button button-primary flex-1 sm:flex-none shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                    onClick={handlePublish}
                    disabled={!hasChanges || publishMutation.isPending || (draft.mode === 'custom' && !draft.customObjectPath)}
                  >
                    {publishMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2 inline" /> : null}
                    {t('adminBackground.publish')}
                  </button>
                </div>
              </div>

              {publishNotice && (
                <div className="animate-in fade-in slide-in-from-bottom-2" data-testid="publish-notice">
                  <InlineNotice kind={publishNotice.kind} onDismiss={() => setPublishNotice(null)}>
                    {publishNotice.text}
                  </InlineNotice>
                </div>
              )}
            </div>

            {/* Right Column: Device Previews */}
            <div className="xl:col-span-5 flex flex-col gap-4 sticky top-28">
              <div className="flex items-center justify-between bg-card p-1 rounded-lg border shadow-sm">
                <button
                  type="button"
                  data-testid="preview-desktop-toggle"
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-bold transition-colors ${devicePreview === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setDevicePreview('desktop')}
                >
                  <Maximize size={16} /> {t('adminBackground.desktopView')}
                </button>
                <button
                  type="button"
                  data-testid="preview-mobile-toggle"
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-bold transition-colors ${devicePreview === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setDevicePreview('mobile')}
                >
                  <Smartphone size={16} /> {t('adminBackground.mobileView')}
                </button>
              </div>

              <div ref={previewContainerRef} className="panel p-0 bg-background/50 border-0 shadow-inner flex flex-col items-center justify-center min-h-[600px] overflow-hidden rounded-2xl relative">
                <div className="absolute top-4 left-4 text-xs font-mono text-muted-foreground z-10">
                  {previewWidth} × {previewHeight}
                </div>
                <div
                  data-testid="preview-frame"
                  className="bg-background shadow-2xl rounded-xl border border-border/50 overflow-hidden relative transition-all duration-300 origin-center"
                  style={{
                    width: `${previewWidth}px`,
                    height: `${previewHeight}px`,
                    transform: `scale(${scale})`
                  }}
                >
                  {/* The Preview Shell */}
                  <div className="absolute inset-0 isolate flex flex-col">
                    <LandingBackgroundView
                      bg={draft}
                      localPreviewUrl={localCustomPreview}
                      previewMode={true}
                      previewDevice={devicePreview}
                    />
                    <header className="h-16 border-b border-border/50 bg-background/50 backdrop-blur-md flex items-center px-6 justify-between flex-shrink-0 z-10">
                      <BrandLogo imgClassName="h-7 w-auto object-contain" />
                      {devicePreview === 'desktop' && (
                        <div className="flex items-center gap-5 text-xs font-semibold text-foreground/75">
                          <span>Exchange</span>
                          <span>Track order</span>
                        </div>
                      )}
                    </header>
                    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 z-10 overflow-hidden text-center">
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Clear · Guided · Rate-Checked
                      </span>
                      <h3 className={`${devicePreview === 'desktop' ? 'text-4xl' : 'text-2xl'} max-w-xl font-extrabold leading-tight tracking-tight text-foreground`}>
                        Your Trusted Crypto Exchange
                      </h3>
                      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        Swap and convert assets with clear rate details and guided processing.
                      </p>
                      <div className={`${devicePreview === 'desktop' ? 'max-w-lg' : 'max-w-sm'} mt-2 w-full rounded-2xl border border-border bg-card/95 p-4 text-left shadow-xl backdrop-blur`}>
                        <div className="mb-4 grid grid-cols-2 rounded-full bg-muted p-1 text-center text-xs font-bold">
                          <span className="rounded-full bg-primary px-3 py-2 text-primary-foreground">Swap</span>
                          <span className="px-3 py-2 text-muted-foreground">Convert</span>
                        </div>
                        <div className="space-y-3">
                          <div className="rounded-xl border border-border bg-background/85 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">You send</span>
                            <div className="mt-2 flex items-center justify-between text-sm font-semibold text-foreground"><span>1,000 GBP</span><span>Capitalist</span></div>
                          </div>
                          <div className="rounded-xl border border-border bg-background/85 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">You receive</span>
                            <div className="mt-2 flex items-center justify-between text-sm font-semibold text-foreground"><span>1,106 EUR</span><span>Paysera</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>)}
    </AdminShell>
  );
}
