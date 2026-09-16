import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react';

export type CatalogImageNamespace = 'payment-method' | 'crypto-asset' | 'crypto-network' | 'fiat-currency';
type UploadResponse = { uploadURL: string; objectPath: string };

export function CatalogImageUploadField({
  label,
  persistedPath,
  persistedUrl,
  namespace,
  onPathChange,
  requestUpload,
  deleteUpload,
  disabled,
  onRegisterCommit,
  testId,
}: {
  label: string;
  persistedPath?: string | null;
  persistedUrl?: string | null;
  namespace: CatalogImageNamespace;
  onPathChange: (path: string | null) => void;
  requestUpload: (data: { name: string; contentType: string; size: number }) => Promise<UploadResponse>;
  deleteUpload: (path: string) => Promise<unknown>;
  disabled?: boolean;
  onRegisterCommit?: (commit: () => void) => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(persistedUrl || null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingRef = useRef<string | null>(null);
  const allocatedRef = useRef<string | null>(null);
  const deletingRef = useRef(new Set<string>());
  const deleteRef = useRef(deleteUpload);
  deleteRef.current = deleteUpload;
  const revoke = useCallback((url: string | null) => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); }, []);
  const bestEffortDelete = useCallback((path: string | null) => {
    if (!path || deletingRef.current.has(path)) return Promise.resolve();
    deletingRef.current.add(path);
    return deleteRef.current(path)
      .catch(() => undefined)
      .finally(() => deletingRef.current.delete(path));
  }, []);
  useEffect(() => {
    onRegisterCommit?.(() => {
      pendingRef.current = null;
      allocatedRef.current = null;
    });
  }, [onRegisterCommit]);

  useEffect(() => {
    if (!uploadedPath) setPreview(persistedUrl || null);
  }, [persistedUrl, uploadedPath]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      revoke(preview);
      // If a PUT is active, its continuation deletes the allocation after the
      // write settles. Deleting concurrently could return 404 before the PUT
      // creates the object and leave the completed upload orphaned.
      if (!busyRef.current) bestEffortDelete(allocatedRef.current);
      bestEffortDelete(pendingRef.current);
    };
  // Cleanup intentionally runs only when the editor unmounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const process = async (file?: File) => {
    if (!file || disabled || busyRef.current) return;
    setError('');
    const extension = file.name.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
    const contentType = types[extension || ''] || file.type;
    if (!types[extension || ''] || !['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'].includes(contentType)) {
      setError('Use an SVG, PNG, WebP, JPG, or JPEG image.');
      return;
    }
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      setError('Image size must be between 1 byte and 5 MB.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    let allocatedPath: string | null = null;
    try {
      const previous = uploadedPath;
      const result = await requestUpload({ name: file.name, contentType, size: file.size });
      allocatedPath = result.objectPath;
      allocatedRef.current = allocatedPath;
      if (!mountedRef.current) {
        bestEffortDelete(allocatedPath);
        return;
      }
      const response = await fetch(result.uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
      if (!response.ok) throw new Error('Image upload failed.');
      if (!mountedRef.current) {
        bestEffortDelete(allocatedPath);
        return;
      }
      if (previous) {
        await bestEffortDelete(previous);
      }
      if (!mountedRef.current) {
        bestEffortDelete(allocatedPath);
        return;
      }
      revoke(preview);
      setUploadedPath(result.objectPath);
      pendingRef.current = result.objectPath;
      allocatedRef.current = null;
      setPreview(URL.createObjectURL(file));
      onPathChange(result.objectPath);
    } catch (cause) {
      if (allocatedPath) bestEffortDelete(allocatedPath);
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Image upload failed.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };
  const remove = () => {
    revoke(preview);
    if (uploadedPath) bestEffortDelete(uploadedPath);
    pendingRef.current = null;
    allocatedRef.current = null;
    setUploadedPath(null);
    setPreview(null);
    onPathChange(null);
  };
  return (
    <div className="catalog-image-upload-field" data-namespace={namespace}>
      <span className="field-label">{label}<small>SVG, PNG, WebP, JPG · 1 B–5 MB</small></span>
      <div className={`catalog-image-upload ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void process(e.dataTransfer.files[0]); }}>
        <span className="catalog-image-preview">{preview ? <img src={preview} alt={`${label} preview`} /> : <ImagePlus size={25} aria-hidden />}</span>
        <div className="catalog-image-upload-actions">
          <button type="button" className="catalog-image-drop-target" onClick={() => inputRef.current?.click()} disabled={disabled || busy} aria-label={`Upload ${label}`}>
            {busy ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />} <span>{busy ? 'Uploading…' : preview ? 'Replace' : 'Choose image'}</span>
          </button>
          {preview && <button type="button" className="catalog-image-remove" onClick={remove} disabled={disabled || busy}><Trash2 size={14} /> Remove</button>}
          <input ref={inputRef} hidden type="file" accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg" onChange={e => { void process(e.target.files?.[0]); e.currentTarget.value = ''; }} disabled={disabled || busy} data-testid={testId} />
        </div>
        {persistedPath && <code className="catalog-image-path">{persistedPath}</code>}
        {error && <p className="catalog-image-error" role="alert"><X size={13} />{error}</p>}
      </div>
    </div>
  );
}
