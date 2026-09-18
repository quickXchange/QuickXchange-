import { useLayoutEffect, useState, useMemo } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetBlogArticle, getGetBlogArticleQueryKey, useListBlogCategories, getListBlogCategoriesQueryKey } from '@workspace/api-client-react';
import { PublicShell } from '@/components/public-shell';
import { ErrorState, LoadingBlock, basePath, getPublicObjectUrl } from '@/components/shared-app-ui';
import { ChevronLeft, ChevronRight, Calendar, User, ExternalLink, Share2, Link as LinkIcon, Twitter, Linkedin, Facebook, Check, ShieldCheck, ArrowUpRight, Clock } from 'lucide-react';
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
    <div className="flex flex-wrap items-center gap-2 pt-6 mt-6 border-t border-border lg:border-t-0 lg:mt-0 lg:pt-0">
      <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mr-2">Share</span>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button onClick={handleNativeShare} className="w-8 h-8 flex items-center justify-center bg-card border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors" aria-label="Share">
          <Share2 size={14} />
        </button>
      )}
      <button onClick={handleCopy} className="w-8 h-8 flex items-center justify-center bg-card border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors relative" aria-label="Copy link">
        {copied ? <Check size={14} className="text-primary" /> : <LinkIcon size={14} />}
        {copied && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-bold px-2 py-1 shadow-xl whitespace-nowrap">
            Copied
          </span>
        )}
      </button>
      {shareLinks.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center bg-card border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors" aria-label={`Share on ${link.label}`}>
          <link.icon size={14} />
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
    const title = data.seoTitle?.trim() || `${data.title} | QuickXchange Intelligence`;
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
      return <div className="prose dark:prose-invert prose-lg max-w-none md:prose-xl prose-headings:font-marketing prose-headings:font-extrabold prose-h2:border-b prose-h2:border-border/50 prose-h2:pb-2 prose-a:text-primary hover:prose-a:text-primary/80 prose-img:border prose-img:border-border/50 prose-hr:border-border/50" dangerouslySetInnerHTML={{ __html: sanitizedHTML }} />;
    }
    return <div className="prose dark:prose-invert prose-lg max-w-none md:prose-xl whitespace-pre-wrap">{typeof data.body === 'string' ? data.body : JSON.stringify(data.body)}</div>;
  };

  const prevArticle = data?.previousArticle || null;
  const nextArticle = data?.nextArticle || null;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-12 md:px-8 lg:py-16">
        {article.isLoading ? (
          <LoadingBlock rows={12} />
        ) : article.isError || !data ? (
          <div className="py-20">
            <ErrorState message="Intelligence briefing not found or has been removed." />
            <div className="mt-8 flex justify-center">
              <Link href="/blog" className="px-8 py-3 bg-foreground text-background font-bold text-xs tracking-widest uppercase hover:bg-primary transition-colors">
                Return to Intelligence
              </Link>
            </div>
          </div>
        ) : (
          <article className="pb-16 max-w-4xl mx-auto">
            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="mb-8 flex items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap overflow-x-auto scrollbar-hide">
              <Link href="/blog" className="hover:text-foreground transition-colors">Intelligence</Link>
              <ChevronRight size={12} className="mx-2 opacity-50" />
              {data.category && (
                <>
                  <Link href={`/blog?category=${encodeURIComponent(data.category.slug)}`} className="hover:text-foreground transition-colors">{data.category.name}</Link>
                  <ChevronRight size={12} className="mx-2 opacity-50" />
                </>
              )}
              <span className="text-foreground max-w-[200px] truncate">{data.title}</span>
            </nav>

            <header className="mb-10">
              {data.category && (
                <span className="inline-block mb-4 text-primary text-[11px] font-bold tracking-widest uppercase">
                  {data.category.name}
                </span>
              )}

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-marketing font-extrabold tracking-tight text-foreground leading-[1.05] mb-6">
                {data.title}
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground leading-snug font-medium mb-8 border-l-2 border-primary pl-4">
                {data.excerpt}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-6 py-4 border-y border-border">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <User size={14} className="opacity-50" /> {data.authorName || 'Editorial'}
                  </div>
                  {data.publishedAt && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <time className="flex items-center gap-1.5" dateTime={String(data.publishedAt)}>
                        <Calendar size={14} className="opacity-50" />
                        {new Date(data.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </time>
                      {data.updatedAt && data.updatedAt !== data.publishedAt && (
                        <span className="text-[9px] opacity-70 italic">
                          (Updated {new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="opacity-50" /> {data.readingTimeMinutes} min read
                  </div>
                </div>

                <div className="hidden lg:block">
                  <ShareControls title={data.title} url={typeof window !== 'undefined' ? window.location.href : ''} />
                </div>
              </div>
            </header>

            {data.featuredImagePath && (
              <div className="aspect-[21/9] w-full mb-12 border border-border/50 bg-muted">
                <BlogImageFrame
                  src={getPublicObjectUrl(data.featuredImagePath)}
                  alt={data.featuredImageAlt || data.title}
                  className="w-full h-full"
                />
              </div>
            )}

            <div className="relative">
              {/* Sticky Sidebar Share - alternative location for wide screens */}
              <aside className="hidden xl:flex flex-col gap-3 sticky top-24 w-12 shrink-0 absolute -left-20">
                <div className="h-4 w-px bg-border mx-auto mb-2" />
                <button onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                }} className="w-8 h-8 flex items-center justify-center bg-card border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors mx-auto" aria-label="Copy link">
                  <LinkIcon size={14} />
                </button>
                <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(data.title)}&url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center bg-card border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors mx-auto">
                  <Twitter size={14} />
                </a>
                <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="w-8 h-8 flex items-center justify-center bg-card border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors mx-auto">
                  <Linkedin size={14} />
                </a>
              </aside>

              <div className="flex-1 min-w-0">
                {renderBody()}

                {/* Tags */}
                {data.tags.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-2">
                    {data.tags.map((tag, index) => {
                      const name = textField(tag.name);
                      const tagSlug = textField(tag.slug);
                      return name ? (
                        <Link
                          key={tagSlug || `${name}-${index}`}
                          href={`/blog?tag=${encodeURIComponent(tagSlug || name)}`}
                          className="px-3 py-1.5 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-bold uppercase tracking-widest transition-colors border border-border"
                        >
                          {name}
                        </Link>
                      ) : null;
                    })}
                  </div>
                )}

                {/* Mobile share block */}
                <div className="mt-8 lg:hidden">
                  <ShareControls title={data.title} url={typeof window !== 'undefined' ? window.location.href : ''} />
                </div>

                {/* Sources */}
                {data.citations.length > 0 && (
                  <section className="mt-16 border-t border-border pt-10" aria-labelledby="sources-heading">
                    <div className="bg-muted/30 border border-border p-6 md:p-8">
                      <h2 id="sources-heading" className="text-sm font-bold tracking-widest uppercase text-foreground mb-6 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-primary" /> Source Transparency
                      </h2>
                      <ol className="space-y-4 text-sm">
                        {data.citations.map((citation, index) => {
                          const url = textField(citation.sourceUrl);
                          const sourceTitle = textField(citation.sourceTitle) || textField(citation.publisher) || `Source ${index + 1}`;
                          const publisher = textField(citation.publisher);
                          const claim = textField(citation.claim);
                          return url ? (
                            <li key={`${url}-${index}`} className="pl-4 border-l-2 border-border/50 hover:border-primary transition-colors">
                              <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5 w-fit">
                                {sourceTitle} <ExternalLink size={12} className="opacity-50" />
                              </a>
                              {publisher && publisher !== sourceTitle ? <span className="block mt-1 text-xs text-muted-foreground uppercase tracking-wider">{publisher}</span> : null}
                              {claim ? <p className="mt-2 text-muted-foreground italic">&ldquo;{claim}&rdquo;</p> : null}
                            </li>
                          ) : null;
                        })}
                      </ol>
                    </div>
                  </section>
                )}

                {/* Prev/Next Navigation */}
                {(prevArticle || nextArticle) && (
                  <nav className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-10">
                    {prevArticle ? (
                      <Link href={`/blog/${prevArticle.slug}`} className="group flex flex-col items-start p-6 border border-border bg-card hover:border-primary transition-colors text-left">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-1 group-hover:text-primary transition-colors"><ChevronLeft size={12}/> Previous Brief</span>
                        <span className="font-marketing font-bold text-foreground line-clamp-2 text-lg group-hover:text-primary transition-colors">{prevArticle.title}</span>
                      </Link>
                    ) : <div></div>}

                    {nextArticle && (
                      <Link href={`/blog/${nextArticle.slug}`} className="group flex flex-col items-end p-6 border border-border bg-card hover:border-primary transition-colors text-right">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-3 flex items-center gap-1 group-hover:text-primary transition-colors">Next Brief <ChevronRight size={12}/></span>
                        <span className="font-marketing font-bold text-foreground line-clamp-2 text-lg group-hover:text-primary transition-colors">{nextArticle.title}</span>
                      </Link>
                    )}
                  </nav>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-16 pt-16 border-t border-border">
              <div className="bg-card border border-border p-8 md:p-12 text-center max-w-4xl mx-auto flex flex-col items-center">
                <h3 className="text-2xl md:text-3xl font-marketing font-extrabold text-foreground mb-4 uppercase tracking-tight">Execute with Confidence</h3>
                <p className="text-muted-foreground mb-8 max-w-xl">
                  Leverage our deep liquidity pools and real-time market rates for your institutional trading needs.
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

          </article>
        )}
      </div>
    </PublicShell>
  );
}