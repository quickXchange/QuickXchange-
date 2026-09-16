import { useState } from 'react';
import { Loader2, Megaphone, Pause, Play, Trash2 } from 'lucide-react';
import {
  getListNewsletterSubscribersQueryKey,
  useListNewsletterSubscribers,
  usePublishNewsletterAnnouncement,
  useRemoveNewsletterSubscriber,
  useUpdateNewsletterSubscriber,
} from '@workspace/api-client-react';
import type { NewsletterSubscriberStatus } from '@workspace/api-client-react';
import { AdminShell, apiErrorText, queryClient } from '@/App';
import { cn, InlineNotice, LoadingBlock } from '@/components/shared-app-ui';
import { useAdminPermissions } from '@/lib/admin-permissions';

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export function AdminNewsletterPage() {
  const { can } = useAdminPermissions();
  const canManage = can('site_settings.manage');
  const subscribers = useListNewsletterSubscribers({
    query: { queryKey: getListNewsletterSubscribersQueryKey(), staleTime: 30_000 },
  });
  const updateSubscriber = useUpdateNewsletterSubscriber();
  const removeSubscriber = useRemoveNewsletterSubscriber();
  const publishAnnouncement = usePublishNewsletterAnnouncement();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [announcement, setAnnouncement] = useState({ title: '', description: '', readMorePath: '' });

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListNewsletterSubscribersQueryKey() });
  const mutateSubscriber = (id: string, status: NewsletterSubscriberStatus) => {
    updateSubscriber.mutate({ id, data: { status } }, {
      onSuccess: refresh,
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to update subscriber.') }),
    });
  };
  const remove = (id: string) => {
    if (!window.confirm('Remove this subscriber? They will no longer receive newsletter emails.')) return;
    removeSubscriber.mutate({ id }, {
      onSuccess: refresh,
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to remove subscriber.') }),
    });
  };
  const publish = (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const title = announcement.title.trim();
    const description = announcement.description.trim();
    const readMorePath = announcement.readMorePath.trim();
    if (!title || !description || !readMorePath) {
      setNotice({ kind: 'error', text: 'Enter a title, short description, and published page link.' });
      return;
    }
    if (!/^https?:\/\//i.test(readMorePath) && !readMorePath.startsWith('/')) {
      setNotice({ kind: 'error', text: 'The Read More link must be an absolute URL or a site path beginning with /.' });
      return;
    }
    publishAnnouncement.mutate({ data: { title, description, readMorePath } }, {
      onSuccess: () => {
        setAnnouncement({ title: '', description: '', readMorePath: '' });
        setNotice({ kind: 'success', text: 'Announcement queued for active subscribers.' });
      },
      onError: (error) => setNotice({ kind: 'error', text: apiErrorText(error, 'Unable to publish announcement.') }),
    });
  };

  return (
    <AdminShell title="Newsletter Subscribers" eyebrow="Configuration" requiredPermission="site_settings.view">
      <div className="space-y-6" data-testid="admin-newsletter">
        {notice && <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>}
        {canManage && <section className="panel p-5 md:p-6" data-testid="newsletter-announcement-composer">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><Megaphone size={18} /></div>
            <div><h2 className="text-lg font-bold text-foreground">Send an important update</h2><p className="text-sm text-muted-foreground">Active subscribers receive a branded email with a Read More button.</p></div>
          </div>
          <form className="grid gap-4" onSubmit={publish}>
            <input className="admin-input" maxLength={180} placeholder="Update title" value={announcement.title} onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })} data-testid="input-newsletter-title" />
            <textarea className="admin-input min-h-24" maxLength={600} placeholder="Short description" value={announcement.description} onChange={(e) => setAnnouncement({ ...announcement, description: e.target.value })} data-testid="input-newsletter-description" />
            <input className="admin-input" maxLength={500} placeholder="Read More link (e.g. /blog/your-article)" value={announcement.readMorePath} onChange={(e) => setAnnouncement({ ...announcement, readMorePath: e.target.value })} data-testid="input-newsletter-read-more" />
            <div><button className="button button-primary" type="submit" disabled={publishAnnouncement.isPending} data-testid="button-publish-newsletter">{publishAnnouncement.isPending ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} />} Publish update</button></div>
          </form>
        </section>}

        <section className="panel overflow-hidden" data-testid="newsletter-subscriber-list">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="text-lg font-bold text-foreground">Subscribers</h2><p className="text-sm text-muted-foreground">{subscribers.data?.items.length ?? 0} total subscribers</p></div><button type="button" className="button button-secondary" onClick={() => subscribers.refetch()} disabled={subscribers.isFetching}>Refresh</button></div>
          {subscribers.isLoading ? <LoadingBlock rows={5} /> : subscribers.isError ? <p className="p-5 text-sm text-destructive">Unable to load subscribers. Refresh and try again.</p> : subscribers.data?.items.length ? (
            <div className="divide-y divide-border">
              {subscribers.data.items.map((subscriber) => {
                const active = subscriber.status === 'active';
                return <div key={subscriber.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between" data-testid={`newsletter-subscriber-${subscriber.id}`}>
                  <div className="min-w-0"><p className="truncate font-semibold text-foreground">{subscriber.email}</p><p className="text-xs text-muted-foreground">Subscribed {dateFormatter.format(new Date(subscriber.createdAt))}</p></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold capitalize', active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>{subscriber.status}</span>
                    {canManage && active && <button type="button" className="button button-secondary h-9 px-3 text-xs" disabled={updateSubscriber.isPending} onClick={() => mutateSubscriber(subscriber.id, 'disabled')} data-testid={`button-newsletter-toggle-${subscriber.id}`}><Pause size={13} />Disable</button>}
                    {canManage && subscriber.status === 'disabled' && <button type="button" className="button button-secondary h-9 px-3 text-xs" disabled={updateSubscriber.isPending} onClick={() => mutateSubscriber(subscriber.id, 'active')} data-testid={`button-newsletter-toggle-${subscriber.id}`}><Play size={13} />Enable</button>}
                    {canManage && <button type="button" className="button button-secondary h-9 px-3 text-xs text-destructive hover:text-destructive" disabled={removeSubscriber.isPending} onClick={() => remove(subscriber.id)} data-testid={`button-newsletter-remove-${subscriber.id}`}><Trash2 size={13} /> Remove</button>}
                  </div>
                </div>;
              })}
            </div>
          ) : <p className="p-8 text-center text-sm text-muted-foreground">No newsletter subscribers yet.</p>}
        </section>
      </div>
    </AdminShell>
  );
}