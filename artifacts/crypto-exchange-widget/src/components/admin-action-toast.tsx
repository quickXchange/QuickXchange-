import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, XCircle } from 'lucide-react';
import './admin-action-toast.css';

type ActionToast = { id: number; kind: 'success' | 'error'; message: string };
const DURATION = 5000;
const listeners = new Set<() => void>();
let current: ActionToast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

function publish(toast: ActionToast | null) {
  current = toast;
  listeners.forEach(listener => listener());
}

function dismiss(id: number) {
  if (current?.id !== id) return;
  clearTimeout(timer);
  publish(null);
}

/** One action-result notification for the whole Admin Panel. Never changes an action's request. */
export function notifyAdminAction(kind: 'success' | 'error', message: string) {
  clearTimeout(timer);
  const id = ++nextId;
  publish({ id, kind, message });
  // The progress animation dismisses at its end; this also covers suspended CSS animations.
  timer = setTimeout(() => dismiss(id), DURATION + 80);
}

export function AdminActionToastHost() {
  const toast = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
    () => null,
  );
  const nodeRef = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState(24);

  useLayoutEffect(() => {
    if (!toast) return;
    let frame = 0;
    const position = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = nodeRef.current?.offsetWidth ?? Math.min(420, window.innerWidth - 32);
        const left = (window.innerWidth - width) / 2;
        const right = left + width;
        let clearance = window.innerWidth < 720 ? 84 : 24;
        // Clear visible action rows regardless of the operator's language.
        document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input[type="submit"]').forEach(button => {
          if (button.closest('[data-admin-action-toast]')) return;
          const rect = button.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0 || rect.top < window.innerHeight - 320 || rect.top >= window.innerHeight) return;
          if (rect.right < left || rect.left > right) return;
          clearance = Math.max(clearance, window.innerHeight - rect.top + 12);
        });
        setBottom(clearance);
      });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    const observer = new MutationObserver(position);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      observer.disconnect();
    };
  }, [toast?.id]);

  if (!toast) return null;
  return createPortal(
    <div className="admin-action-toast-viewport" style={{ bottom }} data-admin-action-toast>
      <div
        key={toast.id}
        ref={nodeRef}
        className={`admin-action-toast admin-action-toast--${toast.kind}`}
        role={toast.kind === 'error' ? 'alert' : 'status'}
        aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
        data-testid="admin-action-toast"
      >
        <span className="admin-action-toast-icon" aria-hidden="true">
          {toast.kind === 'success' ? <Check size={19} strokeWidth={2.5} /> : <XCircle size={19} strokeWidth={2.2} />}
        </span>
        <span className="admin-action-toast-message">{toast.message}</span>
        <button type="button" className="admin-action-toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"><X size={16} /></button>
        <span className="admin-action-toast-progress" aria-hidden="true" onAnimationEnd={() => dismiss(toast.id)} />
      </div>
    </div>,
    document.body,
  );
}