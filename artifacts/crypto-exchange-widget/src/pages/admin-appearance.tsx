import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminWebsiteBranding,
  getGetAdminWebsiteBrandingQueryKey,
  useSaveAdminWebsiteBranding,
  useResetAdminWebsiteBranding,
  useRequestWebsiteBrandingUpload,
  getGetWebsiteBrandingQueryKey,
  getGetPublishedSiteContentQueryKey,
} from '@workspace/api-client-react';
import type { WebsiteBrandingSaveInputAlignment } from '@workspace/api-client-react';
import {
  AdminShell,
  ErrorState,
  LoadingBlock,
  apiErrorText,
  InlineNotice,
  basePath,
  cn
} from '../App';
import { Check, Image as ImageIcon, Upload, Loader2, RotateCcw, Save, Trash2, Smartphone, Monitor } from 'lucide-react';
import { useI18n } from '../i18n/provider';

type UploadStatus = { status: 'idle' | 'uploading' | 'done' | 'error', message?: string };

const ALIGNMENTS = [
  { value: 'left', label: 'Left', testId: 'align-left' },
  { value: 'center', label: 'Center', testId: 'align-center' },
  { value: 'right', label: 'Right', testId: 'align-right' },
] as const;

export function AdminAppearancePage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = getGetAdminWebsiteBrandingQueryKey();

  const { data: branding, isLoading, isError, refetch } = useGetAdminWebsiteBranding({
    query: { queryKey, staleTime: 0 }
  });

  const saveMutation = useSaveAdminWebsiteBranding();
  const resetMutation = useResetAdminWebsiteBranding();
  const requestUpload = useRequestWebsiteBrandingUpload();

  const [draft, setDraft] = useState({
    lightLogoPath: '',
    darkLogoPath: '',
    mobileLogoPath: '' as string | null,
    faviconPath: '' as string | null,
    logoWidth: 900,
    logoHeight: 288,
    logoMaxWidth: 200,
    alignment: 'left' as WebsiteBrandingSaveInputAlignment,
  });

  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadStatus>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (branding) {
      setDraft({
        lightLogoPath: branding.lightLogoPath,
        darkLogoPath: branding.darkLogoPath,
        mobileLogoPath: branding.mobileLogoPath,
        faviconPath: branding.faviconPath,
        logoWidth: branding.logoWidth,
        logoHeight: branding.logoHeight,
        logoMaxWidth: branding.logoMaxWidth,
        alignment: branding.alignment as WebsiteBrandingSaveInputAlignment,
      });
      setLocalPreviews({});
    }
  }, [branding]);

  useEffect(() => {
    return () => {
      Object.values(localPreviews).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [localPreviews]);

  const hasChanges = branding && (
    draft.lightLogoPath !== branding.lightLogoPath ||
    draft.darkLogoPath !== branding.darkLogoPath ||
    draft.mobileLogoPath !== branding.mobileLogoPath ||
    draft.faviconPath !== branding.faviconPath ||
    draft.logoWidth !== branding.logoWidth ||
    draft.logoHeight !== branding.logoHeight ||
    draft.logoMaxWidth !== branding.logoMaxWidth ||
    draft.alignment !== branding.alignment
  );

  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetAdminWebsiteBrandingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetWebsiteBrandingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPublishedSiteContentQueryKey() });
  }, [queryClient]);

  const handleSave = () => {
    setNotice(null);
    saveMutation.mutate({ data: draft }, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: 'Brand assets saved successfully.' });
        invalidateQueries();
      },
      onError: (err: unknown) => {
        setNotice({ kind: 'error', text: apiErrorText(err, 'Failed to save brand assets.') });
      }
    });
  };

  const handleReset = () => {
    setNotice(null);
    resetMutation.mutate(undefined, {
      onSuccess: () => {
        setNotice({ kind: 'success', text: 'Brand assets reset to defaults.' });
        invalidateQueries();
      },
      onError: (err: unknown) => {
        setNotice({ kind: 'error', text: apiErrorText(err, 'Failed to reset brand assets.') });
      }
    });
  };

  const handleUpload = async (key: keyof typeof draft, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setUploadProgress(p => ({ ...p, [key]: { status: 'error', message: 'File too large (max 5 MB)' } }));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setUploadProgress(p => ({ ...p, [key]: { status: 'error', message: 'Invalid file type' } }));
      return;
    }

    setUploadProgress(p => ({ ...p, [key]: { status: 'uploading', message: 'Requesting upload...' } }));
    const blobUrl = URL.createObjectURL(file);
    setLocalPreviews(p => ({ ...p, [key]: blobUrl }));

    try {
      const uploadIntent = await requestUpload.mutateAsync({
        data: {
          contentType: file.type as any
        }
      });

      setUploadProgress(p => ({ ...p, [key]: { status: 'uploading', message: 'Uploading image...' } }));
      const res = await fetch(uploadIntent.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);

      setDraft(prev => ({ ...prev, [key]: uploadIntent.objectPath }));
      setUploadProgress(p => ({ ...p, [key]: { status: 'done', message: 'Upload success' } }));
    } catch (err) {
      setUploadProgress(p => ({ ...p, [key]: { status: 'error', message: apiErrorText(err, 'Upload error') } }));
      setLocalPreviews(p => {
        const next = { ...p };
        delete next[key];
        return next;
      });
      URL.revokeObjectURL(blobUrl);
    }
  };

  const clearAsset = (key: 'mobileLogoPath' | 'faviconPath') => {
    const previewUrl = localPreviews[key];
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setLocalPreviews((previews) => {
      const next = { ...previews };
      delete next[key];
      return next;
    });
    setUploadProgress((progress) => {
      const next = { ...progress };
      delete next[key];
      return next;
    });
    setDraft((current) => ({ ...current, [key]: null }));
  };

  const ImageUploader = ({ 
    fieldKey, 
    label, 
    hint, 
    onClear,
    isDarkBg = false,
    className
  }: { 
    fieldKey: keyof typeof draft; 
    label: string; 
    hint?: string; 
    onClear?: () => void;
    isDarkBg?: boolean;
    className?: string;
  }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const progress = uploadProgress[fieldKey];
    const path = draft[fieldKey] as string | null | undefined;
    const local = localPreviews[fieldKey];
    const src = local || (path ? (path.startsWith('/objects/') ? `/api/storage${path}` : path) : null);
    const displaySrc = src ? (src.startsWith('/') ? `${basePath}${src}` : src) : null;

    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <label className="text-sm font-bold text-foreground">{label}</label>
        <div
          className="flex items-start gap-4"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void handleUpload(fieldKey, file);
          }}
          data-testid={`dropzone-${fieldKey}`}
        >
          <div 
            className={cn(
              "w-28 h-28 rounded-xl border-2 overflow-hidden relative group shrink-0",
              !displaySrc && "border-dashed",
              isDarkBg ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"
            )}
          >
            {displaySrc ? (
              <img src={displaySrc} alt={label} className="w-full h-full object-contain p-2" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
                <ImageIcon size={32} />
              </div>
            )}
            
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                type="button" 
                className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid={`btn-upload-${fieldKey}`}
              >
                <Upload size={18} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            {hint && <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{hint}</p>}
            
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                className="button button-secondary h-8 px-3 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose File
              </button>
              {onClear && path && (
                <button 
                  type="button" 
                  className="button h-8 px-3 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border border-transparent"
                  onClick={onClear}
                  data-testid={`btn-clear-${fieldKey}`}
                >
                  Clear
                </button>
              )}
            </div>
            
            <input 
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(fieldKey, file);
                e.target.value = '';
              }}
             />
            <p className="mt-2 text-[11px] font-medium text-muted-foreground">
              Or drag and drop an SVG, PNG, WEBP, JPG, or JPEG file here. Maximum 5 MB.
            </p>
            
            {progress && progress.status !== 'idle' && (
              <div className="mt-3">
                <InlineNotice kind={progress.status === 'error' ? 'error' : progress.status === 'done' ? 'success' : 'info'}>
                  <div className="flex items-center gap-2">
                    {progress.status === 'uploading' && <Loader2 size={14} className="animate-spin" />}
                    <span>{progress.message}</span>
                  </div>
                </InlineNotice>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminShell title="Appearance" eyebrow="DESIGN" requiredPermission="site_settings.view">
      <div className="desk-notes" data-testid="admin-appearance-page">
        <div>
          <h2>Website Branding</h2>
          <p>
            Manage the global logos and appearance settings used across the exchange. 
            Changes here are applied everywhere instantly.
          </p>
        </div>

        {isLoading ? (
          <LoadingBlock rows={6} />
        ) : isError ? (
          <ErrorState message="Failed to load branding." retry={() => refetch()} />
        ) : branding ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start pb-20">
            {/* Left Column */}
            <div className="admin-form xl:col-span-8 flex flex-col gap-6">
              
              {/* Asset Uploads */}
              <div className="admin-form-card panel p-6">
                <div className="panel-heading mb-6">
                  <div>
                    <h3 className="font-mono text-lg font-bold">Brand Assets</h3>
                    <p className="text-muted-foreground text-xs mt-1">Upload primary and responsive logos.</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-8">
                  <ImageUploader 
                    fieldKey="lightLogoPath" 
                    label="Light Mode Logo (Required)" 
                    hint="Displayed on light backgrounds. Use a dark-colored logo for contrast. Recommended format: SVG or transparent PNG."
                    isDarkBg={false}
                  />
                  
                  <div className="h-px bg-border/50 w-full" />
                  
                  <ImageUploader 
                    fieldKey="darkLogoPath" 
                    label="Dark Mode Logo (Required)" 
                    hint="Displayed on dark backgrounds and inverse surfaces. Use a light-colored logo for contrast."
                    isDarkBg={true}
                  />
                  
                  <div className="h-px bg-border/50 w-full" />
                  
                  <ImageUploader 
                    fieldKey="mobileLogoPath" 
                    label="Mobile Icon (Optional)" 
                    hint="Optional compact mark (e.g. icon only) displayed on very small screens where the full logo might be truncated."
                    isDarkBg={false}
                    onClear={() => clearAsset('mobileLogoPath')}
                  />

                  <div className="h-px bg-border/50 w-full" />
                  
                  <ImageUploader 
                    fieldKey="faviconPath" 
                    label="Favicon (Optional)" 
                    hint="The icon shown in the browser tab. Recommended size: 32x32px minimum, 1:1 aspect ratio."
                    isDarkBg={false}
                    onClear={() => clearAsset('faviconPath')}
                  />
                </div>
              </div>

            </div>

            {/* Right Column */}
            <div className="admin-form xl:col-span-4 flex flex-col gap-6">
              
              {/* Display Settings */}
              <div className="admin-form-card panel p-6">
                <div className="panel-heading mb-6">
                  <div>
                    <h3 className="font-mono text-lg font-bold">Display Settings</h3>
                    <p className="text-muted-foreground text-xs mt-1">Configure layout and sizing.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  <div className="admin-form-field">
                    <label className="text-sm font-bold text-foreground mb-2 block">Alignment</label>
                    <div className="flex gap-2 p-1 bg-muted/50 rounded-xl border border-border">
                      {ALIGNMENTS.map(align => (
                        <button
                          key={align.value}
                          type="button"
                          data-testid={align.testId}
                          onClick={() => setDraft(p => ({ ...p, alignment: align.value }))}
                          className={cn(
                            "flex-1 py-2 text-xs font-bold rounded-lg transition-colors",
                            draft.alignment === align.value 
                              ? "bg-background text-foreground shadow-sm" 
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                          )}
                        >
                          {align.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="admin-form-field">
                    <label className="text-sm font-bold text-foreground mb-2 block">Intrinsic Width (px)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="4096"
                      value={draft.logoWidth}
                      onChange={e => setDraft(p => ({ ...p, logoWidth: Number(e.target.value) }))}
                      className="w-full bg-input border border-border rounded-lg h-10 px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="admin-form-field">
                    <label className="text-sm font-bold text-foreground mb-2 block">Intrinsic Height (px)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="4096"
                      value={draft.logoHeight}
                      onChange={e => setDraft(p => ({ ...p, logoHeight: Number(e.target.value) }))}
                      className="w-full bg-input border border-border rounded-lg h-10 px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="admin-form-field">
                    <label className="text-sm font-bold text-foreground mb-2 block">Display Max Width (px)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="4096"
                      value={draft.logoMaxWidth}
                      onChange={e => setDraft(p => ({ ...p, logoMaxWidth: Number(e.target.value) }))}
                      className="w-full bg-input border border-border rounded-lg h-10 px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                      Constrains the visual width of the logo in the header while preserving aspect ratio.
                    </p>
                  </div>
                </div>
              </div>

              {/* Notice */}
              {notice && (
                <div className="animate-in fade-in duration-200">
                  <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>
                </div>
              )}

              {/* Actions */}
              <div className="admin-form-card panel p-4 flex flex-col gap-3 sticky bottom-6 z-10 shadow-xl border-primary/10">
                <button
                  type="button"
                  data-testid="button-save-appearance"
                  className="button button-primary w-full h-11"
                  onClick={handleSave}
                  disabled={!hasChanges || saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                  Save Changes
                </button>
                
                {branding.custom && (
                  <button
                    type="button"
                    data-testid="button-reset-appearance"
                    className="button button-secondary w-full h-11 text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                    onClick={handleReset}
                    disabled={resetMutation.isPending}
                  >
                    {resetMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <RotateCcw size={16} className="mr-2" />}
                    Reset to Defaults
                  </button>
                )}
              </div>

            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
