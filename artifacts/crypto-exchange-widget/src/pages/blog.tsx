import { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useListBlogArticles, useListBlogCategories, getListBlogCategoriesQueryKey, getListBlogArticlesQueryKey } from '@workspace/api-client-react';
import { PublicShell } from '@/components/public-shell';
import { cn, ErrorState, LoadingBlock, basePath, getPublicObjectUrl } from '@/components/shared-app-ui';
import { ChevronLeft, ChevronRight, Newspaper, ArrowRight, Search, X } from 'lucide-react';
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
    let newTitle = 'Insights & News | QuickXchange';
    let newDesc = 'Authoritative market context, institutional updates, and deep dives into the digital asset ecosystem.';

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

  // If we have search/tag filters, we don't show a massive featured article to avoid confusing context.
  const isFiltered = !!categoryParam || !!tagParam || !!searchParam;

  const featuredArticle = page === 1 && !isFiltered && allArticles.length > 0
    ? (allArticles.find(a => a.isFeatured) || allArticles[0])
    : null;

  const listArticles = featuredArticle ? allArticles.filter(a => a.id !== featuredArticle.id) : allArticles;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 md:px-8 py-12 lg:py-20 min-h-[100dvh] flex flex-col">
        {/* Header */}
        <header className="mb-12 md:mb-20 text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-marketing font-extrabold tracking-tight text-foreground mb-6">
            QuickXchange <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">Insights</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Authoritative market context, institutional updates, and deep dives into the digital asset ecosystem.
          </p>
        </header>

        {/* Toolbar: Categories & Search */}
        <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-6 mb-12 pb-6 border-b border-border/50 sticky top-16 md:top-20 z-40 bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <button
              className={cn(
                "whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all duration-300",
                !categoryParam
                  ? "bg-foreground text-background shadow-md"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => handleCategoryChange()}
              data-testid="button-blog-category-all"
            >
              All News
            </button>
            {categories.data?.map(cat => (
              <button
                key={cat.id}
                className={cn(
                  "whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all duration-300",
                  categoryParam === cat.slug
                    ? "bg-foreground text-background shadow-md"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => handleCategoryChange(cat.slug)}
                data-testid={`button-blog-category-${cat.slug}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72 md:shrink-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search articles..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-full h-11 pl-11 pr-10 rounded-full bg-muted/30 border border-border/50 focus:border-primary/50 focus:bg-card focus:ring-1 focus:ring-primary/50 transition-all text-sm font-medium outline-none placeholder:text-muted-foreground/70"
            />
            {searchValue && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-full"
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
          <div className="flex flex-col items-center justify-center py-32 bg-muted/20 rounded-[2.5rem] border border-dashed border-border/50 text-center px-4">
            <Newspaper size={48} className="text-muted-foreground/30 mb-6" />
            <h3 className="text-2xl font-marketing font-bold mb-3 text-foreground">No articles found</h3>
            <p className="text-muted-foreground max-w-md">
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
                className="mt-8 px-6 py-3 rounded-full bg-foreground text-background font-bold text-sm tracking-wide transition-transform hover:scale-105"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-16">

            {/* Featured Hero Article */}
            {featuredArticle && (
              <section aria-label="Featured Story">
                <Link href={`/blog/${featuredArticle.slug}`} className="group block">
                  <article className="relative grid lg:grid-cols-12 gap-8 lg:gap-12 items-stretch bg-card rounded-[2.5rem] border border-border/50 p-3 md:p-4 lg:p-6 transition-all duration-500 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5 overflow-hidden">
                    <div className="lg:col-span-8 self-center rounded-[2rem] overflow-hidden aspect-[16/9]">
                      <BlogImageFrame
                        src={featuredArticle.featuredImagePath ? getPublicObjectUrl(featuredArticle.featuredImagePath) : null}
                        alt={featuredArticle.featuredImageAlt || featuredArticle.title}
                        className="w-full h-full rounded-[2rem]"
                      />
                    </div>

                    <div className="lg:col-span-4 flex flex-col justify-center p-4 md:p-6 lg:p-4 relative z-10">
                      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-bl from-primary/10 to-transparent blur-3xl rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                      <BlogMeta
                        article={featuredArticle}
                        category={categoryById.get(featuredArticle.categoryId)}
                        className="mb-6"
                      />

                      <h2 className="text-3xl lg:text-4xl xl:text-5xl font-marketing font-extrabold text-foreground mb-6 leading-[1.1] group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-foreground group-hover:to-foreground/70 transition-all duration-300">
                        {featuredArticle.title}
                      </h2>

                      <p className="text-lg text-muted-foreground leading-relaxed mb-8 line-clamp-4">
                        {featuredArticle.excerpt}
                      </p>

                      <div className="mt-auto flex items-center text-primary font-bold text-sm tracking-widest uppercase">
                        Read Story <ArrowRight size={16} className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5" />
                      </div>
                    </div>
                  </article>
                </Link>
              </section>
            )}

            {/* Editorial Grid */}
            {listArticles && listArticles.length > 0 && (
              <section aria-label="Latest Articles">
                <div className="mb-8 flex items-end justify-between gap-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">The latest</span>
                    <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">Latest Articles</h2>
                  </div>
                  <span className="hidden text-sm text-muted-foreground sm:block">Analysis, guides, security and market updates</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                  {listArticles.map((article, index) => {
                    const isWide = index % 7 === 0;
                    return (
                    <Link
                      key={article.id}
                      href={`/blog/${article.slug}`}
                      className={cn("group flex flex-col", isWide && "lg:col-span-2")}
                    >
                      <article className={cn(
                        "h-full bg-transparent group-hover:bg-muted/10 rounded-[2rem] transition-colors duration-500",
                        isWide ? "flex flex-col md:grid md:grid-cols-2 md:gap-7" : "flex flex-col",
                      )}>
                        <div className={cn(
                          "rounded-[1.5rem] overflow-hidden border border-border/30",
                          isWide ? "aspect-[16/9] self-start" : "aspect-[16/9] mb-6",
                        )}>
                          <BlogImageFrame
                            src={article.featuredImagePath ? getPublicObjectUrl(article.featuredImagePath) : null}
                            alt={article.featuredImageAlt || article.title}
                            className="w-full h-full rounded-[1.5rem]"
                          />
                        </div>
                        <div className={cn("flex flex-col flex-1 px-2", isWide && "py-6 md:py-8 md:pr-8")}>
                          <BlogMeta
                            article={article}
                            category={categoryById.get(article.categoryId)}
                            className="mb-4"
                          />
                          <h3 className="text-xl md:text-2xl font-marketing font-bold text-foreground mb-4 leading-tight group-hover:text-primary transition-colors duration-300 line-clamp-3">
                            {article.title}
                          </h3>
                          <p className="text-muted-foreground leading-relaxed text-sm line-clamp-3 mb-6 flex-1">
                            {article.excerpt}
                          </p>
                          <div className="flex items-center text-foreground font-bold text-xs tracking-widest uppercase mt-auto opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                            Read <ArrowRight size={14} className="ml-1.5" />
                          </div>
                        </div>
                      </article>
                    </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Quick Links Section */}
            <div className="mt-16 pt-16 border-t border-border/50">
              <div className="text-center bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 rounded-[3rem] p-10 md:p-16 mb-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-background/40 backdrop-blur-sm pointer-events-none" />
                <div className="relative z-10 max-w-2xl mx-auto">
                  <h3 className="text-3xl md:text-4xl font-marketing font-extrabold text-foreground mb-6">Ready to start trading?</h3>
                  <p className="text-lg text-muted-foreground mb-10">
                    Experience seamless crypto conversion with real-time market rates and instant settlement.
                  </p>
                  <Link href="/convert" className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-foreground text-background font-bold tracking-wide hover:scale-105 transition-transform shadow-xl">
                    Convert Crypto Now
                  </Link>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <Link href="/swap" className="p-8 rounded-[2rem] bg-card border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all text-left">
                  <h4 className="font-bold text-lg mb-2 text-foreground">Manual Swap</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">Exchange large volumes safely through our desk.</p>
                </Link>
                <Link href="/crypto-pairs" className="p-8 rounded-[2rem] bg-card border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all text-left">
                  <h4 className="font-bold text-lg mb-2 text-foreground">Crypto Pairs</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">View our supported markets and settlement options.</p>
                </Link>
                <Link href="/faq" className="p-8 rounded-[2rem] bg-card border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all text-left">
                  <h4 className="font-bold text-lg mb-2 text-foreground">Platform FAQ</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">Answers to common operational questions.</p>
                </Link>
              </div>
            </div>

            {/* Pagination */}
            {articles.data && articles.data.total > articles.data.pageSize && (
              <nav className="flex items-center justify-between pt-12 border-t border-border/50" aria-label="Pagination">
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2 h-12 px-6 rounded-full text-sm font-bold tracking-wide transition-all duration-300",
                    page === 1
                      ? "opacity-50 cursor-not-allowed text-muted-foreground bg-muted/20"
                      : "bg-card border border-border hover:border-primary/50 hover:text-primary hover:shadow-md"
                  )}
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  <ChevronLeft size={16} /> Newer
                </button>

                <span className="hidden md:block text-sm font-bold tracking-widest uppercase text-muted-foreground">
                  Page {page} / {Math.ceil(articles.data.total / articles.data.pageSize)}
                </span>

                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-2 h-12 px-6 rounded-full text-sm font-bold tracking-wide transition-all duration-300",
                    page * articles.data.pageSize >= articles.data.total
                      ? "opacity-50 cursor-not-allowed text-muted-foreground bg-muted/20"
                      : "bg-card border border-border hover:border-primary/50 hover:text-primary hover:shadow-md"
                  )}
                  disabled={page * articles.data.pageSize >= articles.data.total}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Older <ChevronRight size={16} />
                </button>
              </nav>
            )}
          </div>
        )}
      </div>
    </PublicShell>
  );
}