import { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useListBlogArticles, useListBlogCategories, getListBlogCategoriesQueryKey, getListBlogArticlesQueryKey } from '@workspace/api-client-react';
import { PublicShell } from '@/components/public-shell';
import { cn, ErrorState, LoadingBlock, basePath, getPublicObjectUrl } from '@/components/shared-app-ui';
import { ChevronLeft, ChevronRight, Newspaper, ArrowRight, Search, X, ArrowUpRight } from 'lucide-react';
import { BlogImageFrame, BlogMeta } from '@/components/blog-ui';

export function BlogPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const pageParam = searchParams.get('page');
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const categoryParam = searchParams.get('category') || undefined;
  const tagParam = searchParams.get('tag') || undefined;
  const searchParam = searchParams.get('search') || undefined;

  const [searchValue, setSearchValue] = useState(searchParam || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const categories = useListBlogCategories({ query: { queryKey: getListBlogCategoriesQueryKey(), staleTime: 60_000 } });

  const params = { page, pageSize: 13, category: categoryParam, tag: tagParam, search: searchParam };
  const articles = useListBlogArticles(
    params,
    { query: { queryKey: getListBlogArticlesQueryKey(params), staleTime: 60_000 } }
  );

  useEffect(() => {
    let restore: Array<() => void> = [];
    const setMeta = (
      selector: string,
      attribute: 'name' | 'property',
      key: string,
      content: string,
    ) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      const created = !meta;
      const previous = meta?.content;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attribute, key);
        document.head.appendChild(meta);
      }
      meta.content = content;
      restore.push(() => {
        if (created) meta?.remove();
        else if (meta && previous !== undefined) meta.content = previous;
      });
    };

    const previousTitle = document.title;
    let newTitle = 'Market Intelligence | QuickXchange';
    let newDesc = 'Authoritative context, institutional updates, and deep dives into the digital asset ecosystem.';

    if (categoryParam) {
      newTitle = `${categoryParam.charAt(0).toUpperCase() + categoryParam.slice(1)} News | QuickXchange`;
    }
    if (searchParam) {
      newTitle = `Search: ${searchParam} | QuickXchange`;
    }
    if (page > 1) {
      newTitle = `${newTitle} (Page ${page})`;
    }

    document.title = newTitle;
    setMeta('meta[name="description"]', 'name', 'description', newDesc);
    setMeta('meta[property="og:title"]', 'property', 'og:title', newTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', newDesc);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'QuickXchange');

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonicalLink;
    const previousCanonical = canonicalLink?.href;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    const cleanParams = new URLSearchParams();
    if (categoryParam) cleanParams.set('category', categoryParam);
    if (searchParam) cleanParams.set('search', searchParam);
    if (page > 1) cleanParams.set('page', page.toString());
    const queryStr = cleanParams.toString();
    const canonicalUrl = `${window.location.origin}${basePath}/blog${queryStr ? `?${queryStr}` : ''}`;
    canonicalLink.href = canonicalUrl;

    const blogJsonLd = document.createElement('script');
    blogJsonLd.type = 'application/ld+json';
    blogJsonLd.dataset.clientBlogJsonld = 'collection';
    blogJsonLd.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: newTitle,
      description: newDesc,
      url: canonicalUrl,
      publisher: { '@type': 'Organization', name: 'QuickXchange', url: window.location.origin }
    });
    document.head.appendChild(blogJsonLd);

    let prevLink: HTMLLinkElement | undefined;
    let nextLink: HTMLLinkElement | undefined;

    if (articles.data) {
      const hasPrev = page > 1;
      const hasNext = page * articles.data.pageSize < articles.data.total;

      if (hasPrev) {
        prevLink = document.createElement('link');
        prevLink.rel = 'prev';
        const pParams = new URLSearchParams(cleanParams);
        if (page - 1 === 1) pParams.delete('page');
        else pParams.set('page', (page - 1).toString());
        const pStr = pParams.toString();
        prevLink.href = `${window.location.origin}${basePath}/blog${pStr ? `?${pStr}` : ''}`;
        document.head.appendChild(prevLink);
      }

      if (hasNext) {
        nextLink = document.createElement('link');
        nextLink.rel = 'next';
        const nParams = new URLSearchParams(cleanParams);
        nParams.set('page', (page + 1).toString());
        const nStr = nParams.toString();
        nextLink.href = `${window.location.origin}${basePath}/blog${nStr ? `?${nStr}` : ''}`;
        document.head.appendChild(nextLink);
      }
    }

    return () => {
      document.title = previousTitle;
      restore.reverse().forEach(fn => fn());
      if (canonicalCreated) canonicalLink?.remove();
      else if (canonicalLink && previousCanonical) canonicalLink.href = previousCanonical;
      blogJsonLd.remove();
      if (prevLink) prevLink.remove();
      if (nextLink) nextLink.remove();
    };
  }, [categoryParam, searchParam, page, articles.data]);

  const handlePageChange = (newPage: number) => {
    const p = new URLSearchParams(window.location.search);
    p.set('page', newPage.toString());
    setLocation(`/blog?${p.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryChange = (slug?: string) => {
    const p = new URLSearchParams(window.location.search);
    p.set('page', '1');
    if (slug) {
      p.set('category', slug);
      p.delete('tag');
    } else {
      p.delete('category');
    }
    setLocation(`/blog?${p.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams(window.location.search);
    p.set('page', '1');
    if (searchValue.trim()) {
      p.set('search', searchValue.trim());
    } else {
      p.delete('search');
    }
    setLocation(`/blog?${p.toString()}`);
  };

  const clearSearch = () => {
    setSearchValue('');
    const p = new URLSearchParams(window.location.search);
    p.delete('search');
    p.set('page', '1');
    setLocation(`/blog?${p.toString()}`);
    searchInputRef.current?.focus();
  };

  const allArticles = articles.data?.items || [];
  const categoryById = useMemo(
    () => new Map((categories.data || []).map(category => [category.id, category])),
    [categories.data],
  );

  const isFiltered = !!categoryParam || !!tagParam || !!searchParam;

  const featuredArticle = page === 1 && !isFiltered && allArticles.length > 0
    ? (allArticles.find(a => a.isFeatured) || allArticles[0])
    : null;

  const listArticles = featuredArticle ? allArticles.filter(a => a.id !== featuredArticle.id) : allArticles;
  const rightColArticles = featuredArticle ? listArticles.slice(0, 3) : [];
  const remainingArticles = featuredArticle ? listArticles.slice(3) : listArticles;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 md:px-8 min-h-[100dvh] flex flex-col bg-background">
        {/* Header */}
        <header className="pt-12 md:pt-16 pb-10 border-b border-border text-left">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-marketing font-extrabold tracking-tight text-foreground uppercase mb-4">
            Market <span className="text-primary">Intelligence</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl font-medium">
            Authoritative context, institutional updates, and deep dives into the digital asset ecosystem.
          </p>
        </header>

        {/* Toolbar: Categories & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8 mb-10 pb-4 border-b border-border/50 sticky top-16 md:top-20 z-40 bg-background/95 backdrop-blur-md">
          <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <button
              className={cn(
                "whitespace-nowrap pb-3 text-[11px] md:text-xs font-bold tracking-widest uppercase transition-all duration-200 border-b-2",
                !categoryParam
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
              onClick={() => handleCategoryChange()}
              data-testid="button-blog-category-all"
            >
              Latest
            </button>
            {categories.data?.map(cat => (
              <button
                key={cat.id}
                className={cn(
                  "whitespace-nowrap pb-3 text-[11px] md:text-xs font-bold tracking-widest uppercase transition-all duration-200 border-b-2",
                  categoryParam === cat.slug
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
                onClick={() => handleCategoryChange(cat.slug)}
                data-testid={`button-blog-category-${cat.slug}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search intelligence..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-full h-9 pl-9 pr-8 bg-muted/20 border border-border focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/50 transition-all text-sm font-medium outline-none placeholder:text-muted-foreground/70 rounded-sm"
            />
            {searchValue && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </form>
        </div>

        {/* Content */}
        {articles.isLoading ? (
          <LoadingBlock rows={8} />
        ) : articles.isError ? (
          <ErrorState message="Failed to load articles. Please refresh the page." />
        ) : !articles.data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-32 bg-muted/10 border border-border text-center px-4 mb-16">
            <Newspaper size={48} className="text-muted-foreground/30 mb-6" />
            <h3 className="text-2xl font-marketing font-bold mb-3 text-foreground">No intelligence found</h3>
            <p className="text-muted-foreground max-w-md mb-8">
              {searchParam
                ? `We couldn't find anything matching "${searchParam}". Try different keywords.`
                : "Check back later for new editorial content."}
            </p>
            {(searchParam || categoryParam || tagParam) && (
              <button
                onClick={() => {
                  setSearchValue('');
                  setLocation('/blog');
                }}
                className="px-6 py-2 bg-foreground text-background font-bold text-xs tracking-widest uppercase hover:bg-primary transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col">

            {/* Featured Hero & Briefs */}
            {featuredArticle && (
              <section aria-label="Featured Story" className="mb-16">
                <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">

                  {/* Left: Featured */}
                  <div className="lg:col-span-8 flex flex-col group">
                    <Link href={`/blog/${featuredArticle.slug}`}>
                      <div className="aspect-[16/9] w-full mb-6 overflow-hidden border border-border bg-muted">
                        <BlogImageFrame
                          src={featuredArticle.featuredImagePath ? getPublicObjectUrl(featuredArticle.featuredImagePath) : null}
                          alt={featuredArticle.featuredImageAlt || featuredArticle.title}
                          className="w-full h-full"
                        />
                      </div>
                      <BlogMeta
                        article={featuredArticle}
                        category={categoryById.get(featuredArticle.categoryId)}
                        className="mb-4"
                      />
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-marketing font-extrabold text-foreground mb-4 leading-[1.1] group-hover:text-primary transition-colors">
                        {featuredArticle.title}
                      </h2>
                      <p className="text-lg text-muted-foreground line-clamp-3">
                        {featuredArticle.excerpt}
                      </p>
                    </Link>
                  </div>

                  {/* Right: Briefs */}
                  {rightColArticles.length > 0 && (
                    <div className="lg:col-span-4 flex flex-col border-t lg:border-t-0 lg:border-l border-border pt-8 lg:pt-0 lg:pl-8">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full" /> Latest Briefs
                      </h3>
                      <div className="flex flex-col divide-y divide-border/50">
                        {rightColArticles.map(article => (
                          <Link key={article.id} href={`/blog/${article.slug}`} className="group py-5 first:pt-0 last:pb-0">
                            <BlogMeta
                              article={article}
                              category={categoryById.get(article.categoryId)}
                              className="mb-2 text-[9px]"
                            />
                            <h4 className="text-lg font-marketing font-bold text-foreground group-hover:text-primary transition-colors leading-snug line-clamp-3">
                              {article.title}
                            </h4>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </section>
            )}

            {/* Grid for remaining articles */}
            {remainingArticles.length > 0 && (
              <section aria-label="More Intelligence" className="mb-16">
                {featuredArticle && (
                  <div className="flex items-center gap-4 mb-8">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">More Intelligence</h3>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
                  {remainingArticles.map((article) => (
                    <Link key={article.id} href={`/blog/${article.slug}`} className="group flex flex-col">
                      <div className="aspect-[16/10] w-full mb-4 overflow-hidden border border-border/50 bg-muted">
                        <BlogImageFrame
                          src={article.featuredImagePath ? getPublicObjectUrl(article.featuredImagePath) : null}
                          alt={article.featuredImageAlt || article.title}
                          className="w-full h-full"
                        />
                      </div>
                      <BlogMeta
                        article={article}
                        category={categoryById.get(article.categoryId)}
                        className="mb-3"
                      />
                      <h4 className="text-xl font-marketing font-bold text-foreground group-hover:text-primary transition-colors leading-snug mb-2 line-clamp-3">
                        {article.title}
                      </h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {article.excerpt}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Bottom CTA */}
            <div className="mt-8 pt-16 border-t border-border">
              <div className="bg-card border border-border p-8 md:p-12 text-center max-w-4xl mx-auto flex flex-col items-center">
                <h3 className="text-2xl md:text-3xl font-marketing font-extrabold text-foreground mb-4 uppercase tracking-tight">Institutional-Grade Execution</h3>
                <p className="text-muted-foreground mb-8 max-w-xl">
                  Experience seamless crypto conversion with real-time market rates, deep liquidity, and instant settlement.
                </p>
                <Link href="/convert" className="inline-flex items-center justify-center px-8 py-3 bg-foreground text-background font-bold text-xs tracking-widest uppercase hover:bg-primary transition-colors">
                  Open Convert Desk
                </Link>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mt-8 max-w-5xl mx-auto mb-12">
                <Link href="/swap" className="p-6 bg-muted/20 border border-border hover:border-primary transition-colors text-left group">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-foreground mb-2 group-hover:text-primary transition-colors flex justify-between items-center">
                    Manual Swap <ArrowUpRight size={14} className="opacity-50" />
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">Exchange large volumes safely through our OTC desk.</p>
                </Link>
                <Link href="/crypto-pairs" className="p-6 bg-muted/20 border border-border hover:border-primary transition-colors text-left group">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-foreground mb-2 group-hover:text-primary transition-colors flex justify-between items-center">
                    Supported Markets <ArrowUpRight size={14} className="opacity-50" />
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">View our supported assets and settlement options.</p>
                </Link>
                <Link href="/faq" className="p-6 bg-muted/20 border border-border hover:border-primary transition-colors text-left group">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-foreground mb-2 group-hover:text-primary transition-colors flex justify-between items-center">
                    Platform FAQ <ArrowUpRight size={14} className="opacity-50" />
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">Answers to common operational questions.</p>
                </Link>
              </div>
            </div>

            {/* Pagination */}
            {articles.data && articles.data.total > articles.data.pageSize && (
              <nav className="flex items-center justify-between py-10 border-t border-border" aria-label="Pagination">
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2 h-10 px-4 text-xs font-bold tracking-widest uppercase border transition-colors",
                    page === 1
                      ? "opacity-30 cursor-not-allowed border-border/50 text-muted-foreground"
                      : "border-border bg-card hover:border-primary hover:text-primary text-foreground"
                  )}
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  <ChevronLeft size={14} /> Newer
                </button>

                <span className="hidden md:block text-xs font-bold tracking-widest uppercase text-muted-foreground">
                  Page {page} / {Math.ceil(articles.data.total / articles.data.pageSize)}
                </span>

                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2 h-10 px-4 text-xs font-bold tracking-widest uppercase border transition-colors",
                    page * articles.data.pageSize >= articles.data.total
                      ? "opacity-30 cursor-not-allowed border-border/50 text-muted-foreground"
                      : "border-border bg-card hover:border-primary hover:text-primary text-foreground"
                  )}
                  disabled={page * articles.data.pageSize >= articles.data.total}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Older <ChevronRight size={14} />
                </button>
              </nav>
            )}
          </div>
        )}
      </div>
    </PublicShell>
  );
}