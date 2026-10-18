import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Bell, CheckCheck, Check, Trash2, ChevronLeft, ChevronRight, ArrowRight, RefreshCw, Inbox, ShoppingBag, ArrowDownUp, Download, CircleAlert, Network, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useMarkAdminInboxRead, useReadAdminInboxItem, useDeleteAdminInboxItem,
} from '@workspace/api-client-react';
import type { AdminInboxItem } from '@workspace/api-client-react';
import { AdminShell, apiErrorText, ago } from '../App';
import { useAdminInboxLive } from '../lib/admin-inbox';
import './admin-notifications-page.css';

type Filter = 'all' | 'read' | 'unread';
function kindMeta(kind: string): { Icon: LucideIcon; tone: string } {
  const k = kind.toLowerCase();
  if (/fail|reject|expire|cancel/.test(k)) return { Icon: CircleAlert, tone: 'danger' };
  if (/provider|api|integration|monitor/.test(k)) return { Icon: Network, tone: 'warn' };
  if (/deposit|receiv/.test(k)) return { Icon: Download, tone: 'info' };
  if (/status|update|paid|complete/.test(k)) return { Icon: ArrowDownUp, tone: 'info' };
  if (/order|new/.test(k)) return { Icon: ShoppingBag, tone: 'primary' };
  return { Icon: ShieldAlert, tone: 'warn' };
}

const FILTERS: Filter[] = ['all', 'unread', 'read'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', unread: 'Unread', read: 'Read' };

export function AdminNotifications() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const inbox = useAdminInboxLive({ filter, page });
  const returnedPage = inbox.data?.page;
  useEffect(() => { if (returnedPage && returnedPage !== page) setPage(returnedPage); }, [returnedPage, page]);
  const markAll = useMarkAdminInboxRead();
  const markOne = useReadAdminInboxItem();
  const remove = useDeleteAdminInboxItem();

  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === '/api/admin/notifications' });
  const fail = (fallback: string) => (e: unknown) => setActionError(apiErrorText(e, fallback));
  const run = <T,>(m: { mutate: (v: T, o: { onSuccess: () => void; onError: (e: unknown) => void }) => void }, v: T, fallback: string) => {
    setActionError(null);
    m.mutate(v, { onSuccess: () => { void refresh(); }, onError: fail(fallback) });
  };

  const data = inbox.data;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const busy = markAll.isPending || markOne.isPending || remove.isPending;

  const openOrder = (item: AdminInboxItem) => {
    if (!item.orderId) return;
    const target = `/admin/orders/${encodeURIComponent(item.orderId)}`;
    if (item.read) { setLocation(target); return; }
    setActionError(null);
    markOne.mutate({ id: item.id }, {
      onSuccess: () => { void refresh(); setLocation(target); },
      onError: fail('Could not mark this notification as read.'),
    });
  };

  const counts: Record<Filter, number | undefined> = { all: data?.allCount, unread: data?.unreadCount, read: data?.readCount };

  return (
    <AdminShell title="Notifications" eyebrow="SYSTEM / INBOX" titleIcon={<Bell size={20} />}
      subtitle="Alerts for your account. Read and delete states are private to you."
      action={<button type="button" className="qxn-btn qxn-btn-primary" data-testid="button-mark-all-read"
        disabled={busy || !data?.unreadCount}
        onClick={() => run(markAll, undefined as void, 'Could not mark all as read.')}>
        <CheckCheck size={15} /> Mark all read</button>}>
      <div className="qxn-wrap">
        <div className="qxn-tabs" role="tablist">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f}
              className={`qxn-tab${filter === f ? ' active' : ''}`} data-testid={`tab-inbox-${f}`}
              onClick={() => { setFilter(f); setPage(1); }}>
              {FILTER_LABEL[f]}<span className="qxn-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>

        {actionError && <div className="qxn-error" role="alert" data-testid="text-inbox-action-error">{actionError}</div>}

        {inbox.isLoading ? (
          <div className="qxn-list" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="qxn-skel" />)}
          </div>
        ) : inbox.error ? (
          <div className="qxn-empty" data-testid="state-inbox-error">
            <p>{apiErrorText(inbox.error, 'Notifications could not be loaded.')}</p>
            <button type="button" className="qxn-btn" onClick={() => void inbox.refetch()}><RefreshCw size={14} /> Retry</button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="qxn-empty" data-testid="state-inbox-empty">
            <Inbox size={28} />
            <strong>{filter === 'unread' ? 'You are all caught up' : 'No notifications'}</strong>
            <p>{filter === 'all' ? 'New order and system alerts will appear here.' : `Nothing in ${FILTER_LABEL[filter].toLowerCase()} right now.`}</p>
          </div>
        ) : (
          <ul className="qxn-list">
            {data.items.map((item) => (
              <li key={item.id} className={`qxn-item${item.read ? '' : ' unread'}`} data-testid={`row-inbox-${item.id}`}>
                <span className="qxn-dot" aria-hidden="true" />
                {(() => { const { Icon, tone } = kindMeta(item.kind); return (
                  <span className={`qxn-kind ${tone}`} aria-hidden="true" data-testid={`icon-inbox-kind-${item.id}`}><Icon size={16} /></span>
                ); })()}
                <div className="qxn-body">
                  <div className="qxn-head"><strong>{item.title}</strong><time dateTime={item.createdAt}>{ago(item.createdAt)}</time></div>
                  <p>{item.message}</p>
                  {item.orderId && (
                    <button type="button" className="qxn-link" data-testid={`link-inbox-order-${item.id}`}
                      disabled={busy} onClick={() => openOrder(item)}>
                      View order <ArrowRight size={13} />
                    </button>
                  )}
                </div>
                <div className="qxn-actions">
                  {!item.read && (
                    <button type="button" className="qxn-icon" title="Mark read" aria-label="Mark read"
                      data-testid={`button-inbox-read-${item.id}`} disabled={busy}
                      onClick={() => run(markOne, { id: item.id }, 'Could not mark as read.')}><Check size={15} /></button>
                  )}
                  <button type="button" className="qxn-icon danger" title="Delete" aria-label="Delete"
                    data-testid={`button-inbox-delete-${item.id}`} disabled={busy}
                    onClick={() => run(remove, { id: item.id }, 'Could not delete this notification.')}><Trash2 size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && data.total > pageSize && (
          <div className="qxn-pager">
            <button type="button" className="qxn-btn" disabled={page <= 1} data-testid="button-inbox-prev" onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="qxn-btn" disabled={page >= totalPages} data-testid="button-inbox-next" onClick={() => setPage(page + 1)}>Next <ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
