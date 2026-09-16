import { useLayoutEffect, useState, useMemo } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetBlogArticle, getGetBlogArticleQueryKey, useListBlogCategories, getListBlogCategoriesQueryKey } from '@workspace/api-client-react';
import { PublicShell } from '@/components/public-shell';
import { ErrorState, LoadingBlock, basePath, getPublicObjectUrl } from '@/components/shared-app-ui';
import { ChevronLeft, ChevronRight, Calendar, User, ExternalLink, Share2, Link as LinkIcon, Twitter, Linkedin, Facebook, Check, Newspaper } from 'lucide-react';
import DOMPurify from 'dompurify';
import { BlogImageFrame } from '@/components/blog-ui';

const textField = (value: unknown) => typeof value === 'string' ? value : '';

function ShareControls({ title, url }: { title: string, url: string }) {
  const [copied, setCopied] = useState(false);

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (err) {
        // user aborted or not supported natively
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Ignored clipboard error
    });
  };

  const shareLinks = [
    { icon: Twitter, href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, label: 'Twitter' },
    { icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, label: 'LinkedIn' },
    { icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, label: 'Facebook' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-3 p-4 bg-muted/20 rounded-2xl border border-border/40">
      <span className="text-xs font-bold tracking-widest uppercase text-muted-foreground ml-2 mr-3">Share</span>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button onClick={handleNativeShare} className="p-3 rounded-full bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all shadow-sm hover:shadow-md" aria-label="Share">
          <Share2 size={16} />
        </button>
      )}
      <button onClick={handleCopy} className="p-3 rounded-full bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all shadow-sm hover:shadow-md relative" aria-label="Copy link">
        {copied ? <Check size={16} className="text-primary" /> : <LinkIcon size={16} />}
        {copied && (
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-bold px-3 py-1.5 rounded-full shadow-xl whitespace-nowrap animate-in fade-in zoom-in slide-in-from-bottom-2">
            Link copied!
          </span>
        )}
      </button>
      {shareLinks.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full bg-card border border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all shadow-sm hover:shadow-md" aria-label={`Share on ${link.label}`}>
          <link.icon size={16} />
        </a>
      ))}
    </div>
  );
}

export function BlogDetailPage() {
  const [, params] = useRoute('/blog/:slug');
  const slug = params?.slug;

  const categories = useListBlogCategories({ query: { queryKey: getListBlogCategoriesQueryKey(), staleTime: 60_000 } });

  const article = useGetBlogArticle(slug || '', {
    query: {
      enabled: !!slug,
      queryKey: getGetBlogArticleQueryKey(slug || ''),
      staleTime: 60_000
    }
  });

  const data = article.data;

  const categoryById = useMemo(
    () => new Map((categories.data || []).map(cat => [cat.id, cat])),
    [categories.data],
  );

  useLayoutEffect(() => {
    if (!data || !slug) return;

    const previousTitle = document.title;
    const title = data.seoTitle?.trim() || `${data.title} | QuickXchange Blog`;
    const description = data.seoDescription?.trim() || data.excerpt;
    const canonical = data.canonicalUrl?.trim() || `${window.location.origin}${basePath}/blog/${slug}`;
    const imagePath = data.socialImagePath || data.featuredImagePath;
    const image = imagePath
      ? `${window.location.origin}${getPublicObjectUrl(imagePath)}`
      : undefined;

    const restore: Array<() => void> = [];
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
      restore.push(() => created ? meta?.remove() : meta && previous !== undefined && (meta.content = previous));
    };

    document.title = title;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', `${data.indexPage ? 'index' : 'noindex'}, ${data.followLinks ? 'follow' : 'nofollow'}`);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'article');
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'QuickXchange');
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    if (data.publishedAt) {
      setMeta('meta[property="article:published_time"]', 'property', 'article:published_time', data.publishedAt);
    }
    if (data.updatedAt) {
      setMeta('meta[property="article:modified_time"]', 'property', 'article:modified_time', data.updatedAt);
    }
    if (data.authorName) {
      setMeta('meta[property="article:author"]', 'property', 'article:author', data.authorName);
    }
    if (data.category?.name) {
      setMeta('meta[property="article:section"]', 'property', 'article:section', data.category.name);
    }

    if (image) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', image);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
      if (data.featuredImageAlt || data.title) {
        setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', data.featuredImageAlt || data.title);
      }
    }

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonicalLink;
    const previousCanonical = canonicalLink?.href;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;

    const articleJsonLd = document.createElement('script');
    articleJsonLd.type = 'application/ld+json';
    articleJsonLd.dataset.clientBlogJsonld = 'article';
    articleJsonLd.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: data.title,
      description,
      datePublished: data.publishedAt,
      dateModified: data.updatedAt,
      mainEntityOfPage: canonical,
      author: { '@type': 'Person', name: data.authorName || 'QuickXchange Editorial' },
      publisher: { '@type': 'Organization', name: 'QuickXchange', url: window.location.origin },
      ...(image ? { image: [image] } : {}),
    });

    document.head.append(articleJsonLd);

    return () => {
      document.title = previousTitle;
      restore.reverse().forEach(fn => fn());
      if (canonicalCreated) canonicalLink?.remove();
      else if (canonicalLink && previousCanonical) canonicalLink.href = previousCanonical;
      articleJsonLd.remove();
    };
  }, [data]);

  const renderBody = () => {
    if (!data) return null;
    if (data.bodyFormat === 'html' && typeof data.body === 'string') {
      const sanitizedHTML = DOMPurify.sanitize(data.body);
      return <div className="prose dark:prose-invert prose-lg max-w-none md:prose-xl prose-headings:font-marketing prose-headings:font-extrabold prose-a:text-primary hover:prose-a:text-primary/80 prose-img:rounded-3xl prose-img:border prose-img:border-border/30 prose-hr:border-border/50" dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />;
    }
    return <div className="prose dark:prose-invert prose-lg max-w-none md:prose-xl whitespace-pre-wrap">{typeof data.body === 'string' ? data.body : JSON.stringify(data.body)}</div>;
  };

  const prevArticle = data?.previousArticle || null;
  const nextArticle = data?.nextArticle || null;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-12 md:px-8 lg:py-16">
        {article.isLoading ? (
          <LoadingBlock rows={12} />
        ) : article.isError || !data ? (
          <div className="py-20">
            <ErrorState message="Article not found or has been removed." />
            <div className="mt-8 flex justify-center">
              <Link href="/blog" className="px-8 py-4 rounded-full bg-foreground text-background font-bold text-sm tracking-wide">
                Return to Insights
              </Link>
            </div>
          </div>
        ) : (
          <article className="pb-16">

            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="mb-10 flex items-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap overflow-x-auto scrollbar-hide">
              <Link href="/blog" className="hover:text-primary transition-colors">Insights</Link>
              <ChevronRight size={12} className="mx-3 opacity-50" />
              {data.category && (
                <>
                  <Link href={`/blog?category=${encodeURIComponent(data.category.slug)}`} className="hover:text-primary transition-colors">{data.category.name}</Link>
                  <ChevronRight size={12} className="mx-3 opacity-50" />
                </>
              )}
              <span className="text-foreground max-w-[200px] truncate">{data.title}</span>
            </nav>

            <header className="mb-12">
              <div className="flex flex-col gap-y-4 mb-8">
                {data.category && (
                  <div>
                    <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase border border-primary/20">
                      {data.category.name}
                    </span>
                  </div>
                )}

                <h1 className="text-4xl md:text-5xl lg:text-[4rem] font-marketing font-extrabold tracking-tight text-foreground leading-[1.1]">
                  {data.title}
                </h1>

                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-medium mt-4">
                  {data.excerpt}
                </p>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 border-t border-border/50 pt-6 text-sm font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User size={16} className="opacity-70" />
                    <span className="font-bold text-foreground">{data.authorName || 'QuickXchange Editorial'}</span>
                  </div>
                  {data.publishedAt && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <time className="flex items-center gap-2" dateTime={String(data.publishedAt)}>
                        <Calendar size={16} className="opacity-70" />
                        {new Date(data.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </time>
                      {data.updatedAt && data.updatedAt !== data.publishedAt && (
                        <span className="text-xs opacity-70 italic">
                          (Updated {new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <span>{data.readingTimeMinutes} min read</span>
                  </div>
                </div>
              </div>
            </header>

            {data.featuredImagePath && (
              <div className="aspect-[16/9] w-full rounded-[2.5rem] mb-16 shadow-2xl shadow-black/10">
                <BlogImageFrame
                  src={getPublicObjectUrl(data.featuredImagePath)}
                  alt={data.featuredImageAlt || data.title}
                  className="w-full h-full rounded-[2.5rem]"
                />
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">

              {/* Sticky Sidebar for desktop share */}
              <aside className="hidden lg:flex flex-col gap-6 sticky top-24 w-16 shrink-0">
                <div className="h-px w-full bg-border/50 mb-2"></div>
                <button onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                }} className="p-3 rounded-full bg-card border border-border hover:border-primary/50 text-muted-foreground hover:text-primary transition-all" aria-label="Copy link">
                  <LinkIcon size={18} />
                </button>
                <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(data.title)}&url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full bg-card border border-border hover:border-primary/50 text-muted-foreground hover:text-primary transition-all">
                  <Twitter size={18} />
                </a>
                <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full bg-card border border-border hover:border-primary/50 text-muted-foreground hover:text-primary transition-all">
                  <Linkedin size={18} />
                </a>
              </aside>

              <div className="flex-1 min-w-0">
                <div className="relative">
                  {renderBody()}
                </div>

                {/* Tags */}
                {data.tags.length > 0 && (
                  <div className="mt-16 pt-8 border-t border-border/50 flex flex-wrap gap-2">
                    {data.tags.map((tag, index) => {
                      const name = textField(tag.name);
                      const tagSlug = textField(tag.slug);
                      return name ? (
                        <Link
                          key={tagSlug || `${name}-${index}`}
                          href={`/blog?tag=${encodeURIComponent(tagSlug || name)}`}
                          className="px-4 py-2 rounded-full bg-muted/40 hover:bg-primary/10 text-muted-foreground hover:text-primary text-xs font-bold uppercase tracking-widest transition-colors border border-transparent hover:border-primary/20"
                        >
                          {name}
                        </Link>
                      ) : null;
                    })}
                  </div>
                )}

                {/* Mobile share block */}
                <div className="mt-12 lg:hidden">
                  <ShareControls title={data.title} url={typeof window !== 'undefined' ? window.location.href : ''} />
                </div>

                {/* Sources */}
                {data.citations.length > 0 && (
                  <section className="mt-16 bg-muted/20 rounded-3xl p-8 border border-border/40" aria-labelledby="article-sources-heading">
                    <h2 id="article-sources-heading" className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-6">Editorial Sources</h2>
                    <ol className="space-y-5">
                      {data.citations.map((citation, index) => {
                        const url = textField(citation.sourceUrl);
                        const sourceTitle = textField(citation.sourceTitle) || textField(citation.publisher) || `Source ${index + 1}`;
                        const publisher = textField(citation.publisher);
                        const claim = textField(citation.claim);
                        return url ? (
                          <li key={`${url}-${index}`} className="pl-4 border-l-2 border-primary/20 text-sm">
                            <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 font-bold text-foreground hover:text-primary transition-colors">
                              {sourceTitle} <ExternalLink size={13} aria-hidden="true" className="opacity-70" />
                            </a>
                            {publisher && publisher !== sourceTitle ? <span className="ml-2 text-muted-foreground">— {publisher}</span> : null}
                            {claim ? <p className="mt-2 text-muted-foreground italic">&ldquo;{claim}&rdquo;</p> : null}
                          </li>
                        ) : null;
                      })}
                    </ol>
                  </section>
                )}

                {/* Prev/Next Navigation */}
                {(prevArticle || nextArticle) && (
                  <nav className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/50 pt-16">
                    {prevArticle ? (
                      <Link href={`/blog/${prevArticle.slug}`} className="group flex flex-col items-start p-6 rounded-[2rem] border border-border/40 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-3 group-hover:text-primary transition-colors flex items-center gap-1"><ChevronLeft size={12}/> Previous</span>
                        <span className="font-marketing font-bold text-foreground line-clamp-2 text-lg group-hover:text-primary transition-colors">{prevArticle.title}</span>
                      </Link>
                    ) : <div></div>}

                    {nextArticle && (
                      <Link href={`/blog/${nextArticle.slug}`} className="group flex flex-col items-end p-6 rounded-[2rem] border border-border/40 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-right">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-3 group-hover:text-primary transition-colors flex items-center gap-1">Next <ChevronRight size={12}/></span>
                        <span className="font-marketing font-bold text-foreground line-clamp-2 text-lg group-hover:text-primary transition-colors">{nextArticle.title}</span>
                      </Link>
                    )}
                  </nav>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-24 text-center bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 rounded-[3rem] p-10 md:p-16 relative overflow-hidden">
              <div className="absolute inset-0 bg-background/40 backdrop-blur-sm pointer-events-none" />
              <div className="relative z-10 max-w-2xl mx-auto">
                <Newspaper size={40} className="mx-auto text-primary mb-6 opacity-80" />
                <h3 className="text-3xl md:text-4xl font-marketing font-extrabold text-foreground mb-6">Stay ahead of the market.</h3>
                <p className="text-lg text-muted-foreground mb-10">
                  Experience seamless crypto conversion with real-time market rates and deep liquidity for your business.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link href="/convert" className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-full bg-foreground text-background font-bold tracking-wide hover:scale-105 transition-transform shadow-xl">
                    Open Convert Desk
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              <Link href="/swap" className="flex items-center justify-center p-5 rounded-[1.5rem] bg-card border border-border/40 hover:border-primary/50 hover:bg-muted/50 transition-colors text-sm font-bold text-center">
                Manual Swap
              </Link>
              <Link href="/crypto-pairs" className="flex items-center justify-center p-5 rounded-[1.5rem] bg-card border border-border/40 hover:border-primary/50 hover:bg-muted/50 transition-colors text-sm font-bold text-center">
                Supported Markets
              </Link>
              <Link href="/faq" className="flex items-center justify-center p-5 rounded-[1.5rem] bg-card border border-border/40 hover:border-primary/50 hover:bg-muted/50 transition-colors text-sm font-bold text-center">
                Platform FAQ
              </Link>
            </div>
          </article>
        )}
      </div>
    </PublicShell>
  );
}