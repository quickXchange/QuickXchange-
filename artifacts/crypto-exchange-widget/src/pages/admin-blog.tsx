import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useListAdminBlogArticles, useDeleteAdminBlogArticle, usePublishAdminBlogArticle, useUnpublishAdminBlogArticle } from '@workspace/api-client-react';
import { AdminShell } from '@/App';
import { cn, ErrorState, LoadingBlock, StatusPill } from '@/components/shared-app-ui';
import { ago } from '@/App';
import { Plus, Search, Edit2, Trash2, Eye, MoreHorizontal, FileText, Globe2, Clock, CheckCircle2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { queryClient } from '@/App';
import { getListAdminBlogArticlesQueryKey } from '@workspace/api-client-react';
import { useAdminPermissions } from '@/lib/admin-permissions';

export function AdminBlogPage() {
  const { can } = useAdminPermissions();
  const canManage = can('blog.manage');
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const pageParam = searchParams.get('page');
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const [search, setSearch] = useState('');
  const [openArticleMenuId, setOpenArticleMenuId] = useState<string | null>(null);

  const params = { page, pageSize: 20 };
  const articles = useListAdminBlogArticles(params, { query: { queryKey: getListAdminBlogArticlesQueryKey(params), staleTime: 30_000 } });
  const deleteArticle = useDeleteAdminBlogArticle();
  const publishArticle = usePublishAdminBlogArticle();
  const unpublishArticle = useUnpublishAdminBlogArticle();

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this article? If it is published, consider unpublishing it first. Depending on backend policy, this may archive or permanently remove the article.')) return;
    deleteArticle.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAdminBlogArticlesQueryKey() })
    });
  };

  const handlePublish = (id: string) => {
    publishArticle.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAdminBlogArticlesQueryKey() })
    });
  };

  const handleUnpublish = (id: string) => {
    unpublishArticle.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAdminBlogArticlesQueryKey() })
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'published': return { label: 'Published', color: 'bg-success/15 text-success', icon: Globe2 };
      case 'scheduled': return { label: 'Scheduled', color: 'bg-warning/15 text-warning-foreground', icon: Clock };
      case 'draft': return { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: FileText };
      default: return { label: status, color: 'bg-muted text-muted-foreground', icon: FileText };
    }
  };

  const filteredItems = articles.data?.items.filter(item => 
    item.title.toLowerCase().includes(search.toLowerCase()) || 
    item.slug.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!openArticleMenuId) return;
    const closeOnScroll = () => setOpenArticleMenuId(null);
    window.addEventListener('scroll', closeOnScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', closeOnScroll, { capture: true });
  }, [openArticleMenuId]);

  return (
    <AdminShell title="Blog Articles" eyebrow="Content" requiredPermission="blog.view">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex-1 w-full max-w-md relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className="admin-input pl-10 w-full"
            placeholder="Search articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {canManage && <Link href="/admin/blog/automation" className="button button-secondary" data-testid="link-admin-blog-automation">
            Automation
          </Link>}
          {canManage && <Link href="/admin/blog/new" className="button button-primary" data-testid="link-admin-blog-new">
            <Plus size={16} className="mr-1.5" /> New Article
          </Link>}
        </div>
      </div>

      {articles.isLoading ? (
        <LoadingBlock rows={5} />
      ) : articles.isError ? (
        <ErrorState message="Failed to load articles" />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th className="w-1/2">Article</th>
                  <th>Status</th>
                  <th>Published/Scheduled</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-muted-foreground">
                      No articles found.
                    </td>
                  </tr>
                ) : (
                  filteredItems?.map((article) => {
                    const statusConfig = getStatusConfig(article.status);
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <tr key={article.id}>
                        <td>
                          <div className="flex flex-col">
                            <span className="font-bold text-foreground">{article.title}</span>
                            <span className="text-xs text-muted-foreground font-mono mt-1">/{article.slug}</span>
                          </div>
                        </td>
                        <td>
                          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold", statusConfig.color)}>
                            <StatusIcon size={12} />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="text-sm text-muted-foreground whitespace-nowrap">
                          {article.status === 'published' && article.publishedAt ? ago(article.publishedAt) : 
                           article.status === 'scheduled' && article.scheduledAt ? new Date(article.scheduledAt).toLocaleString() : 
                           '—'}
                        </td>
                        <td className="text-right">
                          {canManage ? <DropdownMenu.Root
                            open={openArticleMenuId === article.id}
                            onOpenChange={(open) => setOpenArticleMenuId(open ? article.id : null)}
                          >
                            <DropdownMenu.Trigger asChild>
                              <button className="icon-button" aria-label="Article actions">
                                <MoreHorizontal size={16} />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                className="admin-blog-actions-menu"
                                align="end"
                                side="bottom"
                                sideOffset={8}
                                collisionPadding={12}
                              >
                                <DropdownMenu.Item className="admin-blog-actions-item" onSelect={() => setLocation(`/admin/blog/edit/${article.id}`)}>
                                  <Edit2 size={14} className="mr-2" /> Edit Article
                                </DropdownMenu.Item>
                                
                                {article.status === 'published' && (
                                  <DropdownMenu.Item className="admin-blog-actions-item" onSelect={() => window.open(`/blog/${article.slug}`, '_blank')}>
                                    <Eye size={14} className="mr-2" /> View Public
                                  </DropdownMenu.Item>
                                )}

                                {article.status === 'published' ? (
                                  <DropdownMenu.Item className="admin-blog-actions-item" onSelect={() => handleUnpublish(article.id)}>
                                    <Clock size={14} className="mr-2" /> Revert to Draft
                                  </DropdownMenu.Item>
                                ) : (
                                  <DropdownMenu.Item className="admin-blog-actions-item is-publish" onSelect={() => handlePublish(article.id)}>
                                    <Globe2 size={14} className="mr-2" /> Publish Now
                                  </DropdownMenu.Item>
                                )}
                                
                                <DropdownMenu.Separator className="admin-blog-actions-separator" />
                                
                                <DropdownMenu.Item className="admin-blog-actions-item is-delete" onSelect={() => handleDelete(article.id)}>
                                  <Trash2 size={14} className="mr-2" /> Delete
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root> : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
