import { useEffect, useRef, useState } from 'react';
import { Loader2, Monitor, Smartphone, Tablet } from 'lucide-react';
import { basePath, cn } from '@/components/shared-app-ui';
import type { SitePreviewState } from './site-preview-context';
import { PUBLIC_PAGE_REGISTRY } from '@/lib/public-page-registry';

type PreviewMode = 'desktop' | 'tablet' | 'mobile';
type PreviewTheme = 'light' | 'dark';

interface LivePreviewFrameProps {
  draftState: Omit<SitePreviewState, 'active'>;
}

export function LivePreviewFrame({ draftState }: LivePreviewFrameProps) {
  const [mode, setMode] = useState<PreviewMode>('desktop');
  const [theme, setTheme] = useState<PreviewTheme>('light');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const lastPageKey = useRef(draftState.pageKey);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'SITE_PREVIEW_READY') {
        setIsReady(true);
        setIsApplied(false);
      }
      if (e.data?.type === 'SITE_PREVIEW_APPLIED') {
        setIsApplied(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!isReady || !iframeRef.current?.contentWindow) return;

    if (draftState.pageKey && draftState.pageKey !== lastPageKey.current) {
      lastPageKey.current = draftState.pageKey;
      const pageDef = PUBLIC_PAGE_REGISTRY.find(p => p.key === draftState.pageKey);
      if (pageDef && iframeRef.current) {
          iframeRef.current.src = `${basePath}${pageDef.path}?__preview=1`;
          setIsReady(false);
          setIsApplied(false);
         return;
      }
    }

    iframeRef.current.contentWindow.postMessage({
      type: 'SITE_PREVIEW_UPDATE',
       payload: { ...draftState, theme },
    }, window.location.origin);
  }, [draftState, isReady, theme]);

  const width = mode === 'mobile' ? '375px' : mode === 'tablet' ? '768px' : '100%';

  const initialPath = PUBLIC_PAGE_REGISTRY.find(p => p.key === draftState.pageKey)?.path || '/';

  return (
    <div className="flex flex-col h-full w-full rounded-xl border border-border overflow-hidden bg-muted/20" data-testid="live-preview-container">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-1 bg-muted rounded-md p-1">
          <button type="button" onClick={() => setMode('desktop')} className={cn('p-1.5 rounded-sm text-muted-foreground transition-colors', mode === 'desktop' && 'bg-background text-foreground shadow-sm')} aria-label="Desktop preview" data-testid="preview-mode-desktop"><Monitor size={15} /></button>
          <button type="button" onClick={() => setMode('tablet')} className={cn('p-1.5 rounded-sm text-muted-foreground transition-colors', mode === 'tablet' && 'bg-background text-foreground shadow-sm')} aria-label="Tablet preview" data-testid="preview-mode-tablet"><Tablet size={15} /></button>
          <button type="button" onClick={() => setMode('mobile')} className={cn('p-1.5 rounded-sm text-muted-foreground transition-colors', mode === 'mobile' && 'bg-background text-foreground shadow-sm')} aria-label="Mobile preview" data-testid="preview-mode-mobile"><Smartphone size={15} /></button>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <span className="relative flex h-2 w-2">
            {isApplied ? <><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span></> : <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground"></span>}
          </span>
          Live Preview
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-md p-1">
          <button type="button" onClick={() => setTheme('light')} className={cn('px-2 py-1 text-xs font-semibold rounded-sm text-muted-foreground transition-colors', theme === 'light' && 'bg-background text-foreground shadow-sm')} data-testid="preview-theme-light">Light</button>
          <button type="button" onClick={() => setTheme('dark')} className={cn('px-2 py-1 text-xs font-semibold rounded-sm text-muted-foreground transition-colors', theme === 'dark' && 'bg-background text-foreground shadow-sm')} data-testid="preview-theme-dark">Dark</button>
        </div>
      </div>
      
      <div className="flex-1 bg-muted flex items-center justify-center p-4 relative overflow-hidden">
        {!isApplied && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-muted/80 backdrop-blur-sm text-muted-foreground gap-3">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm font-semibold">Loading Preview Sandbox...</span>
          </div>
        )}
        <div 
          className="h-full bg-background rounded-b-md md:rounded-md shadow-2xl overflow-hidden border border-border/50 transition-all duration-300 ease-in-out relative origin-top"
          style={{ width, maxHeight: '800px' }}
        >
          <iframe
            ref={iframeRef}
            src={`${basePath}${initialPath}?__preview=1`}
            className="w-full h-full border-none bg-background"
            title="Live Preview Sandbox"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
