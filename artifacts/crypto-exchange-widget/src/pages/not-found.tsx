import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { useI18n } from '../i18n/provider';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background noise p-6">
      <Card className="w-full max-w-md shadow-xl border-border rounded-3xl overflow-hidden text-center p-8 bg-card relative">
        <CardContent className="p-0 flex flex-col items-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            {t('notFound.title')}
          </h1>
          <p className="text-[15px] text-muted-foreground mb-8">
            {t('notFound.description')}
          </p>
          <Link href="/" className="button button-primary w-full shadow-lg shadow-primary/20">
            {t('notFound.returnToExchange')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
