import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminLanguageSettings,
  useUpdateAdminLanguageSettings,
  useGetAdminLanguageDictionary,
  useUpdateAdminLanguageDictionary,
} from '@workspace/api-client-react';
import { AdminShell, ErrorState, LoadingBlock, apiErrorText, cn } from '../App';
import { Loader2, Save, Search } from 'lucide-react';
import { useI18n } from '../i18n/provider';
import type { Locale } from '@workspace/i18n';
import { useAdminPermissions } from '@/lib/admin-permissions';
import { notifyAdminAction } from '@/components/admin-action-toast';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ru', label: 'Russian' },
  { code: 'es', label: 'Spanish' },
  { code: 'ko', label: 'Korean' },
  { code: 'uk', label: 'Ukrainian' },
] as const;

function LanguageSettingsCard() {
  const canManage = useAdminPermissions().can('languages.manage');
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useGetAdminLanguageSettings();
  const save = useUpdateAdminLanguageSettings();
  const [enabled, setEnabled] = useState<Locale[]>([]);
  const [fallback, setFallback] = useState<Locale>('en');

  useEffect(() => {
    if (data) {
      setEnabled(data.enabledLanguages);
      setFallback(data.fallbackLanguage);
    }
  }, [data]);

  if (isLoading) return <LoadingBlock rows={4} />;
  if (isError || !data) return <ErrorState message="Failed to load language settings." retry={() => refetch()} />;

  const effectiveFallback = enabled.includes(fallback) ? fallback : enabled[0] ?? 'en';
  const changed =
    effectiveFallback !== data.fallbackLanguage ||
    enabled.length !== data.enabledLanguages.length ||
    enabled.some(c => !data.enabledLanguages.includes(c));

  const toggle = (code: Locale) => {
    setEnabled(cur => {
      if (cur.includes(code)) return cur.length > 1 ? cur.filter(c => c !== code) : cur;
      return LANGUAGES.map(l => l.code).filter(c => c === code || cur.includes(c));
    });
  };

  const onSave = () => {
    save.mutate(
      { data: { enabledLanguages: enabled, fallbackLanguage: effectiveFallback, expectedRevision: data.revision } },
      {
        onSuccess: result => {
          window.dispatchEvent(new Event('qx-languages-updated'));
          try { localStorage.setItem('qx-language-settings-revision', result.revision); } catch { /* Current-tab refresh still works. */ }
          notifyAdminAction('success', 'Language settings saved for Website and Mini App.');
          queryClient.invalidateQueries();
        },
        onError: (err: unknown) => notifyAdminAction('error', apiErrorText(err, 'Failed to save language settings.')),
      },
    );
  };

  return (
    <div className="admin-form-card panel p-6" data-testid="language-settings">
      <div className="panel-heading mb-5">
        <div>
          <h3 className="font-mono text-lg font-bold">Enabled Languages</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Applies to both the Website and the Telegram Mini App. At least one language must stay enabled.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {LANGUAGES.map(l => {
          const on = enabled.includes(l.code);
          return (
            <label
              key={l.code}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm font-bold transition-colors',
                on ? 'border-primary bg-primary/10' : 'border-border bg-muted/20 text-muted-foreground',
              )}
            >
              <input type="checkbox" className="accent-primary" checked={on} onChange={() => toggle(l.code)} data-testid={`toggle-lang-${l.code}`} />
              <span>{l.label}</span>
              <span className="ml-auto font-mono text-[11px] uppercase">{l.code}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div className="admin-form-field">
          <label htmlFor="fallback-lang" className="mb-2 block text-sm font-bold">Fallback language</label>
          <select
            id="fallback-lang"
            value={effectiveFallback}
            onChange={e => setFallback(e.target.value as Locale)}
            className="h-10 min-w-48 rounded-lg border border-border bg-input px-3 text-sm outline-none focus:border-primary"
            data-testid="select-fallback-language"
          >
            {LANGUAGES.filter(l => enabled.includes(l.code)).map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <button type="button" className="button button-primary h-10" onClick={onSave} disabled={!canManage || !changed || save.isPending} data-testid="button-save-languages">
          {save.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save Languages
        </button>
      </div>
    </div>
  );
}

function DictionaryEditor() {
  const canManage = useAdminPermissions().can('languages.manage');
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState<string>('fr');
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const { data, isLoading, isError, refetch } = useGetAdminLanguageDictionary(locale);
  const save = useUpdateAdminLanguageDictionary();

  useEffect(() => { setEdits({}); }, [locale, data?.revision]);

  const keys = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const missing = new Set(data.missingKeys);
    return Object.keys(data.sourceTranslations)
      .filter(k => !onlyMissing || missing.has(k))
      .filter(k => {
        if (!q) return true;
        return (
          k.toLowerCase().includes(q) ||
          data.sourceTranslations[k].toLowerCase().includes(q) ||
          (edits[k] ?? data.translations[k] ?? '').toLowerCase().includes(q)
        );
      })
      .sort();
  }, [data, query, onlyMissing, edits]);

  const changedEntries = useMemo(() => {
    if (!data) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(edits)) if (v !== (data.translations[k] ?? '')) out[k] = v;
    return out;
  }, [data, edits]);
  const changedCount = Object.keys(changedEntries).length;

  const onSave = () => {
    if (!data || !changedCount) return;
    save.mutate(
      { locale, data: { translations: changedEntries, expectedRevision: data.revision } },
      {
        onSuccess: result => {
          window.dispatchEvent(new Event('qx-languages-updated'));
          try { localStorage.setItem('qx-language-settings-revision', result.revision); } catch { /* Current-tab refresh still works. */ }
          notifyAdminAction('success', `${changedCount} translation${changedCount === 1 ? '' : 's'} saved.`);
          queryClient.invalidateQueries();
        },
        onError: (err: unknown) => notifyAdminAction('error', apiErrorText(err, 'Failed to save translations.')),
      },
    );
  };

  return (
    <div className="admin-form-card panel p-6" data-testid="dictionary-editor">
      <div className="panel-heading mb-5">
        <div>
          <h3 className="font-mono text-lg font-bold">Translation Editor</h3>
          <p className="mt-1 text-xs text-muted-foreground">Only changed values are saved.</p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={locale} onChange={e => setLocale(e.target.value)} className="h-10 rounded-lg border border-border bg-input px-3 text-sm outline-none focus:border-primary" data-testid="select-editor-locale">
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="absolute left-3 top-3 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search keys or text" className="h-10 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm outline-none focus:border-primary" data-testid="input-search-translations" />
        </div>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" className="accent-primary" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
          Missing only{data ? ` (${data.missingKeys.length})` : ''}
        </label>
        <button type="button" className="button button-primary h-10" onClick={onSave} disabled={!canManage || !changedCount || save.isPending} data-testid="button-save-translations">
          {save.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save {changedCount ? `${changedCount} change${changedCount === 1 ? '' : 's'}` : 'Changes'}
        </button>
      </div>
      {isLoading ? (
        <LoadingBlock rows={6} />
      ) : isError || !data ? (
        <ErrorState message="Failed to load translations." retry={() => refetch()} />
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No translations match your filters.</div>
      ) : (
        <div className="max-h-[640px] overflow-auto rounded-xl border border-border">
          <div className="sticky top-0 z-10 hidden grid-cols-2 gap-4 border-b border-border bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground md:grid">
            <span>English source</span><span>{LANGUAGES.find(l => l.code === locale)?.label}</span>
          </div>
          {keys.map(k => {
            const value = edits[k] ?? data.translations[k] ?? '';
            const dirty = k in changedEntries;
            const missing = data.missingKeys.includes(k);
            return (
              <div key={k} className={cn('grid gap-2 border-b border-border/60 px-3 py-3 md:grid-cols-2 md:gap-4', dirty && 'bg-primary/5')}>
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{k}</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm">{data.sourceTranslations[k]}</div>
                </div>
                <div>
                  <textarea
                    rows={Math.min(5, Math.max(2, Math.ceil(value.length / 48)))}
                    value={value}
                    onChange={e => setEdits(cur => ({ ...cur, [k]: e.target.value }))}
                    className={cn('w-full rounded-lg border bg-input px-3 py-2 text-sm outline-none focus:border-primary', missing && !value ? 'border-destructive/50' : 'border-border')}
                    aria-label={`${k} translation`}
                  />
                  {missing && !value && <span className="text-[11px] font-bold text-destructive">Missing</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminLanguagesPage() {
  useI18n();
  return (
    <AdminShell title="Languages" eyebrow="DESIGN" requiredPermission="languages.view">
      <div className="desk-notes" data-testid="admin-languages-page">
        <div>
          <h2>Languages</h2>
          <p>Choose which of the seven supported languages customers can use, and edit translations. Changes apply to the Website and the Mini App.</p>
        </div>
        <div className="flex flex-col gap-6 pb-20">
          <LanguageSettingsCard />
          <DictionaryEditor />
        </div>
      </div>
    </AdminShell>
  );
}

export default AdminLanguagesPage;
