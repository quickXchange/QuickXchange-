import { useEffect, useState, useRef, useMemo } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { 
  useGetAdminBlogArticle,
  useCreateAdminBlogArticle, 
  useUpdateAdminBlogArticle,
  useListAdminBlogCategories,
  useRequestAdminBlogImageUpload,
  getGetAdminBlogArticleQueryKey,
  getListAdminBlogArticlesQueryKey,
  getListAdminBlogCategoriesQueryKey
} from '@workspace/api-client-react';
import { AdminShell } from '@/App';
import { ErrorState, LoadingBlock, InlineNotice, basePath, getPublicObjectUrl } from '@/components/shared-app-ui';
import { Save, ChevronLeft, ImagePlus, Loader2 } from 'lucide-react';
import { queryClient } from '@/App';
import type { BlogArticleInput, BlogArticleInputStatus, ImageUploadInputContentType, BlogCitationInput } from '@workspace/api-client-react';
import { useAdminPermissions } from '@/lib/admin-permissions';

export function AdminBlogEditorPage() {
  const { can } = useAdminPermissions();
  const canManage = can('blog.manage');
  const [, params] = useRoute('/admin/blog/edit/:id');
  const [, setLocation] = useLocation();
  const id = params?.id;
  const isNew = !id || id === 'new';

  const { data: article, isLoading: articleLoading, isError: articleError } = useGetAdminBlogArticle(
    id || '', 
    { query: { queryKey: getGetAdminBlogArticleQueryKey(id || ''), enabled: !isNew } }
  );

  const { data: categories } = useListAdminBlogCategories({ query: { queryKey: getListAdminBlogCategoriesQueryKey() } });
  
  const createMutation = useCreateAdminBlogArticle();
  const updateMutation = useUpdateAdminBlogArticle();
  const uploadImage = useRequestAdminBlogImageUpload();

  const [formData, setFormData] = useState<Partial<BlogArticleInput>>({
    title: '',
    slug: '',
    excerpt: '',
    body: {},
    bodyFormat: 'html',
    categoryId: '',
    status: 'draft' as BlogArticleInputStatus,
    featuredImagePath: null,
    featuredImageAlt: '',
    socialImagePath: null,
    isFeatured: false,
    readingTimeMinutes: 5,
    seoTitle: '',
    seoDescription: '',
    canonicalUrl: '',
    indexPage: true,
    followLinks: true,
    authorName: '',
    authorId: '',
    tagNames: [],
    citations: []
  });

  const [bodyText, setBodyText] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState<'featured' | 'social' | null>(null);
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [localSocialImage, setLocalSocialImage] = useState<string | null>(null);
  const [tagNamesString, setTagNamesString] = useState('');

  const initRef = useRef(false);

  useEffect(() => {
    if (!isNew && article && !initRef.current) {
      const tagsString = (article.tags || []).map((t: any) => t.name || t.id || JSON.stringify(t)).join(', ');
      
      const citationsInput: BlogCitationInput[] = (article.citations || []).map(c => ({
        sourceUrl: c.sourceUrl,
        sourceTitle: c.sourceTitle || undefined,
        publisher: c.publisher || undefined,
        claim: c.claim || undefined,
        sourcePublishedAt: c.sourcePublishedAt || null
      }));

      setFormData({
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        body: article.body,
        bodyFormat: article.bodyFormat,
        categoryId: article.categoryId,
        status: article.status as BlogArticleInputStatus,
        featuredImagePath: article.featuredImagePath,
        featuredImageAlt: article.featuredImageAlt,
        socialImagePath: article.socialImagePath,
        isFeatured: article.isFeatured,
        readingTimeMinutes: article.readingTimeMinutes,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        canonicalUrl: article.canonicalUrl,
        indexPage: article.indexPage,
        followLinks: article.followLinks,
        authorName: article.authorName || '',
        authorId: article.authorId || '',
        tagNames: tagsString ? tagsString.split(',').map(s => s.trim()) : [],
        citations: citationsInput
      });
      setBodyText(typeof article.body === 'string' ? article.body : JSON.stringify(article.body, null, 2));
      setTagNamesString(tagsString);
      initRef.current = true;
    } else if (isNew && !initRef.current && categories?.length) {
      setFormData(prev => ({ ...prev, categoryId: categories[0].id }));
      initRef.current = true;
    }
  }, [article, isNew, categories]);

  useEffect(() => {
    return () => {
      if (localImage) URL.revokeObjectURL(localImage);
      if (localSocialImage) URL.revokeObjectURL(localSocialImage);
    };
  }, [localImage, localSocialImage]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'featured' | 'social') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setNotice(null);
    setUploadingImage(type);
    
    try {
      const intent = await uploadImage.mutateAsync({ 
        data: { contentType: file.type as ImageUploadInputContentType } 
      });
      
      const response = await fetch(intent.uploadURL, { 
        method: 'PUT', 
        headers: { 'Content-Type': file.type }, 
        body: file 
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      if (type === 'featured') {
        setFormData(prev => ({ ...prev, featuredImagePath: intent.objectPath }));
        setLocalImage(URL.createObjectURL(file));
      } else {
        setFormData(prev => ({ ...prev, socialImagePath: intent.objectPath }));
        setLocalSocialImage(URL.createObjectURL(file));
      }
    } catch (error) {
      setNotice({ kind: 'error', text: 'Failed to upload image' });
    } finally {
      setUploadingImage(null);
      if (e.target) e.target.value = '';
    }
  };

  const generateSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData(prev => ({
      ...prev,
      title,
      slug: prev.slug === generateSlug(prev.title || '') ? generateSlug(title) : prev.slug
    }));
  };

  const handleSave = () => {
    setNotice(null);
    
    if (!formData.title || !formData.slug || !formData.categoryId) {
      setNotice({ kind: 'error', text: 'Title, slug, and category are required' });
      return;
    }

    let parsedBody: any = bodyText;
    if (formData.bodyFormat === 'blocks') {
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        setNotice({ kind: 'error', text: 'Invalid JSON for blocks format' });
        return;
      }
    }

    // Add expectedUpdatedAt for optimistic concurrency control if backend supports it
    const payload = {
      ...formData,
      body: parsedBody,
      tagNames: tagNamesString.split(',').map(t => t.trim()).filter(Boolean),
      ...(article ? { expectedUpdatedAt: article.updatedAt } : {})
    } as any; // Cast as any because expectedUpdatedAt might not be in the TS schema yet

    if (isNew) {
      createMutation.mutate({ data: payload }, {
        onSuccess: (newArticle) => {
          queryClient.invalidateQueries({ queryKey: getListAdminBlogArticlesQueryKey() });
          setLocation(`/admin/blog/edit/${newArticle.id}`);
          setNotice({ kind: 'success', text: 'Article created successfully' });
        },
        onError: () => setNotice({ kind: 'error', text: 'Failed to create article' })
      });
    } else {
      updateMutation.mutate({ id, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminBlogArticlesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminBlogArticleQueryKey(id) });
          setNotice({ kind: 'success', text: 'Article updated successfully' });
        },
        onError: (error: any) => {
          if (error?.status === 409 || error?.response?.status === 409) {
            setNotice({ kind: 'error', text: 'Conflict: This article was modified by another user or process. Please refresh and review changes before saving again.' });
          } else {
            setNotice({ kind: 'error', text: 'Failed to update article' });
          }
        }
      });
    }
  };

  if (!canManage) {
    return <AdminShell title={isNew ? "New Article" : "Edit Article"} eyebrow="Content" requiredPermission="blog.manage">{null}</AdminShell>;
  }

  if (!isNew && articleLoading) {
    return <AdminShell title="Edit Article" eyebrow="Content" requiredPermission="blog.manage"><LoadingBlock rows={8} /></AdminShell>;
  }

  if (!isNew && (articleError || !article) && !articleLoading) {
    return <AdminShell title="Edit Article" eyebrow="Content" requiredPermission="blog.manage"><ErrorState message="Article not found" /></AdminShell>;
  }

  return (
    <AdminShell title={isNew ? "New Article" : "Edit Article"} eyebrow="Content" requiredPermission="blog.manage">
      <div className="flex items-center justify-between mb-8">
        <Link href="/admin/blog" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft size={16} className="mr-1" /> Back to Articles
        </Link>
        <button 
          className="button button-primary" 
          onClick={handleSave}
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
          Save Article
        </button>
      </div>

      {notice && (
        <div className="mb-6">
          <InlineNotice kind={notice.kind}>{notice.text}</InlineNotice>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-foreground mb-2">Title</label>
              <input 
                className="admin-input text-lg font-semibold h-12 w-full" 
                placeholder="Article title"
                value={formData.title || ''}
                onChange={handleTitleChange}
                data-testid="input-title"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-foreground mb-2">Slug</label>
              <div className="flex items-center">
                <span className="text-muted-foreground bg-muted border border-border border-r-0 rounded-l-md px-3 h-10 flex items-center text-sm">
                  /blog/
                </span>
                <input 
                  className="admin-input rounded-l-none w-full" 
                  placeholder="article-slug"
                  value={formData.slug || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  data-testid="input-slug"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground mb-2">Excerpt</label>
              <textarea 
                className="admin-input w-full h-24 resize-y" 
                placeholder="Brief summary for listings and SEO"
                value={formData.excerpt || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                data-testid="input-excerpt"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-bold text-foreground">Content Body</label>
                <select 
                  className="admin-input py-1 px-2 h-8 text-xs w-auto"
                  value={formData.bodyFormat}
                  onChange={(e) => setFormData(prev => ({ ...prev, bodyFormat: e.target.value as any }))}
                  data-testid="select-body-format"
                >
                  <option value="html">HTML</option>
                  <option value="blocks">JSON Blocks</option>
                </select>
              </div>
              <textarea 
                className="admin-input w-full h-[500px] resize-y font-mono text-sm" 
                placeholder={formData.bodyFormat === 'html' ? "<h1>Heading</h1><p>Content...</p>" : "{\n  \"blocks\": []\n}"}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                data-testid="input-body-text"
              />
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-bold border-b border-border/50 pb-2 mb-4">Citations</h3>
            
            <div className="space-y-4">
              {formData.citations?.map((cit, idx) => (
                <div key={idx} className="p-4 border border-border rounded bg-muted/20 relative">
                  <button 
                    className="absolute top-2 right-2 text-muted-foreground hover:text-red-500" 
                    onClick={() => setFormData(prev => ({ ...prev, citations: prev.citations?.filter((_, i) => i !== idx) }))}
                    data-testid={`btn-remove-citation-${idx}`}
                  >
                    ×
                  </button>
                  <input 
                    className="admin-input text-sm w-full mb-2" placeholder="Source URL" 
                    value={cit.sourceUrl} 
                    onChange={e => {
                      const newCit = [...(formData.citations || [])];
                      newCit[idx].sourceUrl = e.target.value;
                      setFormData(prev => ({ ...prev, citations: newCit }));
                    }}
                    data-testid={`input-citation-url-${idx}`}
                  />
                  <input 
                    className="admin-input text-sm w-full mb-2" placeholder="Source Title" 
                    value={cit.sourceTitle || ''} 
                    onChange={e => {
                      const newCit = [...(formData.citations || [])];
                      newCit[idx].sourceTitle = e.target.value;
                      setFormData(prev => ({ ...prev, citations: newCit }));
                    }}
                    data-testid={`input-citation-title-${idx}`}
                  />
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input 
                      className="admin-input text-sm w-full" placeholder="Publisher" 
                      value={cit.publisher || ''} 
                      onChange={e => {
                        const newCit = [...(formData.citations || [])];
                        newCit[idx].publisher = e.target.value;
                        setFormData(prev => ({ ...prev, citations: newCit }));
                      }}
                      data-testid={`input-citation-publisher-${idx}`}
                    />
                    <input 
                      type="date"
                      className="admin-input text-sm w-full" 
                      value={cit.sourcePublishedAt ? new Date(cit.sourcePublishedAt).toISOString().split('T')[0] : ''} 
                      onChange={e => {
                        const newCit = [...(formData.citations || [])];
                        newCit[idx].sourcePublishedAt = e.target.value ? new Date(e.target.value).toISOString() : null;
                        setFormData(prev => ({ ...prev, citations: newCit }));
                      }}
                      data-testid={`input-citation-date-${idx}`}
                    />
                  </div>
                  <textarea 
                    className="admin-input text-sm w-full h-16 resize-none" placeholder="Claim/Quote" 
                    value={cit.claim || ''} 
                    onChange={e => {
                      const newCit = [...(formData.citations || [])];
                      newCit[idx].claim = e.target.value;
                      setFormData(prev => ({ ...prev, citations: newCit }));
                    }}
                    data-testid={`input-citation-claim-${idx}`}
                  />
                </div>
              ))}
              <button 
                className="button button-secondary text-sm w-full" 
                onClick={() => setFormData(prev => ({ ...prev, citations: [...(prev.citations || []), { sourceUrl: '', sourceTitle: '', publisher: '', claim: '', sourcePublishedAt: null }] }))}
                data-testid="btn-add-citation"
              >
                + Add Citation
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-bold border-b border-border/50 pb-2 mb-4">Publishing</h3>
            
            <div>
              <label className="block text-sm font-bold text-foreground mb-2">Category</label>
              <select 
                className="admin-input w-full"
                value={formData.categoryId || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
              >
                <option value="" disabled>Select category...</option>
                {categories?.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground mb-2">Status</label>
              <select 
                className="admin-input w-full"
                value={formData.status || 'draft'}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                data-testid="select-status"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
                <option value="unpublished">Unpublished</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground mb-2">Tags (Comma-separated)</label>
              <input 
                className="admin-input text-sm w-full" 
                placeholder="crypto, defi, trading"
                value={tagNamesString}
                onChange={(e) => setTagNamesString(e.target.value)}
                data-testid="input-tags"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-foreground mb-2">Reading time (minutes)</label>
              <input
                className="admin-input text-sm w-full"
                type="number"
                min={1}
                max={120}
                value={formData.readingTimeMinutes || 1}
                onChange={(e) => setFormData(prev => ({ ...prev, readingTimeMinutes: Number(e.target.value) }))}
                data-testid="input-reading-time"
              />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-4">
              <input
                type="checkbox"
                checked={formData.isFeatured || false}
                onChange={(e) => setFormData(prev => ({ ...prev, isFeatured: e.target.checked }))}
                data-testid="checkbox-featured"
              />
              <span>
                <span className="block text-sm font-bold text-foreground">Featured article</span>
                <span className="block text-xs text-muted-foreground">Place this article in the lead position on the Blog.</span>
              </span>
            </label>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-bold border-b border-border/50 pb-2 mb-4">Featured Image</h3>
            
            {formData.featuredImagePath ? (
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted border border-border relative mb-3">
                <img 
                  src={localImage || getPublicObjectUrl(formData.featuredImagePath)}
                  alt="Featured" 
                  className="w-full h-full object-cover"
                />
                <button 
                  className="absolute top-2 right-2 button button-secondary h-8 px-2 text-xs opacity-80 hover:opacity-100"
                  onClick={() => { setFormData(prev => ({ ...prev, featuredImagePath: null })); setLocalImage(null); }}
                  data-testid="btn-remove-featured-image"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors mb-3">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {uploadingImage === 'featured' ? (
                    <Loader2 size={24} className="animate-spin text-muted-foreground mb-2" />
                  ) : (
                    <ImagePlus size={24} className="text-muted-foreground mb-2" />
                  )}
                  <p className="text-sm text-muted-foreground">Click to upload featured image</p>
                </div>
                <input type="file" className="hidden" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={e => handleImageUpload(e, 'featured')} disabled={!!uploadingImage} data-testid="input-featured-image" />
              </label>
            )}

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Image Alt Text</label>
              <input 
                className="admin-input text-sm w-full" 
                placeholder="Description for accessibility"
                value={formData.featuredImageAlt || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, featuredImageAlt: e.target.value }))}
                data-testid="input-featured-image-alt"
              />
            </div>

            <h3 className="font-bold border-b border-border/50 pb-2 mb-4 mt-6">Social Image</h3>
            
            {formData.socialImagePath ? (
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted border border-border relative mb-3">
                <img 
                  src={localSocialImage || getPublicObjectUrl(formData.socialImagePath)}
                  alt="Social" 
                  className="w-full h-full object-cover"
                />
                <button 
                  className="absolute top-2 right-2 button button-secondary h-8 px-2 text-xs opacity-80 hover:opacity-100"
                  onClick={() => { setFormData(prev => ({ ...prev, socialImagePath: null })); setLocalSocialImage(null); }}
                  data-testid="btn-remove-social-image"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors mb-3">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {uploadingImage === 'social' ? (
                    <Loader2 size={24} className="animate-spin text-muted-foreground mb-2" />
                  ) : (
                    <ImagePlus size={24} className="text-muted-foreground mb-2" />
                  )}
                  <p className="text-sm text-muted-foreground">Click to upload social image</p>
                </div>
                <input type="file" className="hidden" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={e => handleImageUpload(e, 'social')} disabled={!!uploadingImage} data-testid="input-social-image" />
              </label>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-bold border-b border-border/50 pb-2 mb-4">SEO Details</h3>
            
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">SEO Title</label>
              <input 
                className="admin-input text-sm w-full" 
                placeholder="Overrides article title"
                value={formData.seoTitle || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, seoTitle: e.target.value }))}
                data-testid="input-seo-title"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">SEO Description</label>
              <textarea 
                className="admin-input text-sm w-full h-20 resize-none" 
                placeholder="Overrides excerpt"
                value={formData.seoDescription || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, seoDescription: e.target.value }))}
                data-testid="input-seo-desc"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Canonical URL</label>
              <input 
                className="admin-input text-sm w-full" 
                placeholder="https://..."
                value={formData.canonicalUrl || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, canonicalUrl: e.target.value }))}
                data-testid="input-canonical-url"
              />
            </div>
            
            <div className="flex gap-4 pt-2 border-t border-border/50">
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="checkbox" 
                  checked={formData.indexPage} 
                  onChange={(e) => setFormData(prev => ({ ...prev, indexPage: e.target.checked }))} 
                  data-testid="checkbox-index"
                />
                Index Page
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="checkbox" 
                  checked={formData.followLinks} 
                  onChange={(e) => setFormData(prev => ({ ...prev, followLinks: e.target.checked }))} 
                  data-testid="checkbox-follow"
                />
                Follow Links
              </label>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h3 className="font-bold border-b border-border/50 pb-2 mb-4">Meta Details</h3>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Author Name</label>
              <input 
                className="admin-input text-sm w-full" 
                placeholder="Author display name"
                value={formData.authorName || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, authorName: e.target.value }))}
                data-testid="input-author-name"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Author ID</label>
              <input 
                className="admin-input text-sm w-full bg-muted/50 cursor-not-allowed" 
                placeholder="Managed by server"
                value={formData.authorId || ''}
                disabled
                data-testid="input-author-id"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Published At</label>
              <input 
                type="datetime-local"
                className="admin-input text-sm w-full" 
                value={formData.publishedAt ? new Date(formData.publishedAt).toISOString().slice(0, 16) : ''}
                onChange={(e) => setFormData(prev => ({ ...prev, publishedAt: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                data-testid="input-published-at"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Scheduled At</label>
              <input 
                type="datetime-local"
                className="admin-input text-sm w-full" 
                value={formData.scheduledAt ? new Date(formData.scheduledAt).toISOString().slice(0, 16) : ''}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                data-testid="input-scheduled-at"
              />
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
