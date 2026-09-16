import { cn } from '@/components/shared-app-ui';
import { Calendar, Clock, Newspaper, UserRound } from 'lucide-react';
import type { BlogArticle, BlogCategory } from '@workspace/api-client-react';

export function BlogImageFrame({ src, alt, className }: { src?: string | null, alt?: string | null, className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-muted group/frame", className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/10 to-background/5 mix-blend-overlay z-10 pointer-events-none" />
      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] rounded-inherit z-20 pointer-events-none" />

      {src ? (
        <img
          src={src}
          alt={alt || ""}
          className="block w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-card">
          <Newspaper size={48} className="opacity-10 text-primary mb-4" />
          <span className="font-marketing font-bold text-sm tracking-widest text-muted-foreground opacity-30 uppercase">QuickXchange</span>
        </div>
      )}
    </div>
  );
}

export function BlogMeta({ article, category, className }: { article: BlogArticle, category?: BlogCategory, className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground", className)}>
      {category && (
        <span className="text-primary">{category.name}</span>
      )}
      {article.publishedAt && (
        <span className="flex items-center gap-1.5">
          <Calendar size={13} />
          <time dateTime={String(article.publishedAt)}>
            {new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </time>
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <UserRound size={13} />
        {article.authorName || 'QuickXchange Team'}
      </span>
      <span className="flex items-center gap-1.5">
        <Clock size={13} />
        {article.readingTimeMinutes} min
      </span>
    </div>
  );
}
