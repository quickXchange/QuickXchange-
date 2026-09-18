import { cn } from '@/components/shared-app-ui';
import { Calendar, Clock, Newspaper, UserRound } from 'lucide-react';
import type { BlogArticle, BlogCategory } from '@workspace/api-client-react';

export function BlogImageFrame({ src, alt, className }: { src?: string | null, alt?: string | null, className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-muted flex items-center justify-center", className)}>
      {src ? (
        <img
          src={src}
          alt={alt || ""}
          className="block w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-card border border-border/20">
          <Newspaper size={32} className="opacity-20 text-foreground mb-2" />
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground opacity-40 uppercase">No Image</span>
        </div>
      )}
    </div>
  );
}

export function BlogMeta({ article, category, className }: { article: BlogArticle, category?: BlogCategory, className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground", className)}>
      {category && (
        <span className="text-primary">{category.name}</span>
      )}
      {article.publishedAt && (
        <span className="flex items-center gap-1">
          <Calendar size={12} className="opacity-70" />
          <time dateTime={String(article.publishedAt)}>
            {new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </time>
        </span>
      )}
      <span className="flex items-center gap-1">
        <UserRound size={12} className="opacity-70" />
        {article.authorName || 'Editorial'}
      </span>
      <span className="flex items-center gap-1">
        <Clock size={12} className="opacity-70" />
        {article.readingTimeMinutes}m
      </span>
    </div>
  );
}
