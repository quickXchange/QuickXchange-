import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetTelegramSupportBotQueryKey,
  useCheckTelegramSupportBotConnection,
  useGetTelegramSupportBot,
  useRegisterTelegramSupportBotWebhook,
  useUpdateTelegramSupportBot,
} from '@workspace/api-client-react';
import type {
  SupportBotSettingsInput,
  TelegramSupportBotCategory,
  TelegramSupportBotFaq,
  TelegramSupportBotResponse,
  TelegramSupportBotStatus,
} from '@workspace/api-client-react';
import { AdminShell, apiErrorText, ErrorState, LoadingBlock } from '../App';
import { notifyAdminAction } from '../components/admin-action-toast';
import { useAdminPermissions } from '@/lib/admin-permissions';
import { applyFaqEdit, cleanSettings, LOCALES, newId, validate } from '@/lib/telegram-support-bot-settings';
import type { Locale } from '@/lib/telegram-support-bot-settings';

const SHELL = { eyebrow: 'Telegram / Support Bot', title: 'Support Bot' } as const;
const card = 'rounded-xl border border-border bg-card p-4 sm:p-5';
const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';
const btn = 'inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';

function Toggle({ label, hint, checked, onChange, disabled, testId }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId: string }) {
  return (
    <label className="flex items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
    </label>
  );
}

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ok ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground'}`}>{children}</span>;
}

function LocaleTabs({ value, onChange, filled }: { value: Locale; onChange: (l: Locale) => void; filled: (l: Locale) => boolean }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {LOCALES.map((l) => (
        <button key={l.code} type="button" role="tab" aria-selected={value === l.code} onClick={() => onChange(l.code)}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${value === l.code ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          data-testid={`tab-locale-${l.code}`}>
          {l.code.toUpperCase()}{l.code === 'en' ? ' *' : ''}{filled(l.code) && value !== l.code ? ' \u2022' : ''}
        </button>
      ))}
    </div>
  );
}

function SetupCard({ status }: { status: TelegramSupportBotStatus }) {
  return (
    <section className={card} data-testid="card-owner-setup">
      <h2 className="text-base font-semibold">Owner setup</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a dedicated support bot in BotFather. This must be a separate bot from the Exchange Bot; never reuse TELEGRAM_BOT_TOKEN.
        Add these two secrets in Replit Secrets, then restart the API server. Secrets are never entered, sent or stored here.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex flex-wrap items-center justify-between gap-2"><code>TELEGRAM_SUPPORT_BOT_TOKEN</code><StatusPill ok={status.tokenConfigured}>{status.tokenConfigured ? 'Configured' : 'Missing'}</StatusPill></li>
        <li className="flex flex-wrap items-center justify-between gap-2"><code>TELEGRAM_SUPPORT_BOT_WEBHOOK_SECRET</code><StatusPill ok={status.webhookSecretConfigured}>{status.webhookSecretConfigured ? 'Configured' : 'Missing'}</StatusPill></li>
      </ul>
    </section>
  );
}

export function AdminTelegramSupportBotPage() {
  const { isOwner, isLoading: authLoading } = useAdminPermissions();
  const queryClient = useQueryClient();
  const query = useGetTelegramSupportBot({ query: { queryKey: getGetTelegramSupportBotQueryKey(), enabled: isOwner, refetchOnWindowFocus: false } });
  const update = useUpdateTelegramSupportBot();
  const check = useCheckTelegramSupportBotConnection();
  const register = useRegisterTelegramSupportBotWebhook();

  const [draft, setDraft] = useState<SupportBotSettingsInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [welcomeLocale, setWelcomeLocale] = useState<Locale>('en');
  const [faqLocale, setFaqLocale] = useState<Locale>('en');
  const [editingFaq, setEditingFaq] = useState<string | null>(null);
  const initialized = useRef(false);
  const draftRevision = useRef(0);

  // Initialize once; later refetches/status checks never overwrite local edits.
  useEffect(() => {
    if (query.data && !initialized.current) {
      initialized.current = true;
      setDraft(structuredClone(query.data.settings));
    }
  }, [query.data]);

  const status = query.data?.status;
  const errors = useMemo(() => (draft ? validate(draft, status) : []), [draft, status]);

  if (authLoading) return <AdminShell {...SHELL}><LoadingBlock rows={6} /></AdminShell>;
  if (!isOwner) return <AdminShell {...SHELL}><ErrorState message="Owner access required" /></AdminShell>;
  if (query.isError) return <AdminShell {...SHELL}><ErrorState message={apiErrorText(query.error, 'Unable to load Support Bot settings.')} /><button className={`${btn} mt-3`} onClick={() => void query.refetch()} data-testid="button-retry">Retry</button></AdminShell>;
  if (!draft || !status) return <AdminShell {...SHELL}><LoadingBlock rows={8} /></AdminShell>;

  const edit = (fn: (d: SupportBotSettingsInput) => SupportBotSettingsInput) => { draftRevision.current += 1; setDraft((d) => (d ? fn(d) : d)); setDirty(true); };
  const patchStatus = (next: TelegramSupportBotStatus) =>
    queryClient.setQueryData<TelegramSupportBotResponse>(getGetTelegramSupportBotQueryKey(), (old) => (old ? { ...old, status: next } : old));

  const save = () => {
    setShowErrors(true);
    if (errors.length) { notifyAdminAction('error', 'Fix the highlighted issues before saving.'); return; }
    const submittedRevision = draftRevision.current;
    update.mutate({ data: cleanSettings(draft) }, {
      onSuccess: (saved: TelegramSupportBotResponse) => {
        if (draftRevision.current === submittedRevision) {
          setDraft(structuredClone(saved.settings));
          setDirty(false); setShowErrors(false);
        }
        queryClient.setQueryData(getGetTelegramSupportBotQueryKey(), saved);
        notifyAdminAction('success', 'Support Bot settings saved.');
      },
      onError: (e) => notifyAdminAction('error', apiErrorText(e, 'Unable to save Support Bot settings.')),
    });
  };
  const runCheck = () => check.mutate(undefined, {
    onSuccess: (s) => { patchStatus(s); notifyAdminAction(s.connected ? 'success' : 'error', s.connected ? `Connected as @${s.botUsername ?? 'support bot'}.` : s.error ?? 'Support bot is not connected.'); },
    onError: (e) => notifyAdminAction('error', apiErrorText(e, 'Connection check failed.')),
  });
  const runRegister = () => register.mutate(undefined, {
    onSuccess: (s) => { patchStatus(s); notifyAdminAction(s.webhookRegistered ? 'success' : 'error', s.webhookRegistered ? 'Webhook registered.' : s.error ?? 'Webhook was not registered.'); },
    onError: (e) => notifyAdminAction('error', apiErrorText(e, 'Webhook registration failed.')),
  });

  const credsOk = status.tokenConfigured && status.webhookSecretConfigured;
  const approvedCount = draft.faqs.filter((f) => f.approved).length;
  const err = (cond: boolean) => (showErrors && cond ? 'border-destructive' : '');

  const addCategory = () => edit((d) => d.categories.length >= 20 ? d : ({ ...d, categories: [...d.categories, { id: newId('category', ''), label: { en: '' }, enabled: true }] }));
  const deleteCategory = (c: TelegramSupportBotCategory) => {
    const linked = draft.faqs.filter((f) => f.categoryId === c.id).length;
    if (linked) { notifyAdminAction('error', `${linked} FAQ(s) use this category. Reassign or remove them first.`); return; }
    if (window.confirm('Delete this category?')) edit((d) => ({ ...d, categories: d.categories.filter((x) => x.id !== c.id) }));
  };
  const addFaq = () => {
    if (!draft.categories.length || draft.faqs.length >= 100) return;
    const id = newId('faq', '');
    edit((d) => ({ ...d, faqs: [...d.faqs, { id, categoryId: d.categories[0].id, approved: false, translations: { en: { question: '', answer: '', aliases: [] } } }] }));
    setEditingFaq(id); setFaqLocale('en');
  };
  const patchFaq = (id: string, fn: (f: TelegramSupportBotFaq) => TelegramSupportBotFaq, keepApproval = false) =>
    edit((d) => ({ ...d, faqs: d.faqs.map((f) => { if (f.id !== id) return f; return applyFaqEdit(f, fn, keepApproval); }) }));
  const setFaqText = (f: TelegramSupportBotFaq, key: 'question' | 'answer' | 'aliases', value: string) =>
    patchFaq(f.id, (x) => {
      const cur = x.translations[faqLocale] ?? { question: '', answer: '', aliases: [] };
      const next = key === 'aliases' ? { ...cur, aliases: value.split('\n') } : { ...cur, [key]: value };
      return { ...x, translations: { ...x.translations, [faqLocale]: next } };
    });

  return (
    <AdminShell {...SHELL} subtitle="Dedicated customer support bot. Owner only."
      action={<button className={btnPrimary} onClick={save} disabled={update.isPending || !dirty} data-testid="button-save">{update.isPending ? 'Saving...' : 'Save settings'}</button>}>
      <div className="space-y-4">
        {dirty && <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm" data-testid="text-unsaved">You have unsaved changes.</div>}
        {showErrors && errors.length > 0 && (
          <ul className="rounded-lg border border-destructive/50 px-4 py-2 text-sm text-destructive list-disc pl-6" data-testid="list-validation">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        )}

        <SetupCard status={status} />

        <section className={card} data-testid="card-connection">
          <h2 className="text-base font-semibold">Connection</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <StatusPill ok={status.connected}>{status.connected ? `Connected${status.botUsername ? ` @${status.botUsername}` : ''}` : 'Disconnected'}</StatusPill>
            <StatusPill ok={status.webhookRegistered}>{status.webhookRegistered ? 'Webhook registered' : 'Webhook not registered'}</StatusPill>
          </div>
          {status.webhookUrl && <p className="mt-2 break-all text-xs text-muted-foreground">Webhook endpoint: {status.webhookUrl}</p>}
          {status.lastCheckedAt && <p className="mt-1 text-xs text-muted-foreground">Last checked {new Date(status.lastCheckedAt).toLocaleString()}</p>}
          {status.error && <p className="mt-2 text-sm text-destructive" data-testid="text-status-error">{status.error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btn} onClick={runCheck} disabled={check.isPending || !status.tokenConfigured} data-testid="button-check-connection">{check.isPending ? 'Checking...' : 'Check connection'}</button>
            <button className={btn} onClick={runRegister} disabled={register.isPending || !status.registrationAllowed || !credsOk} data-testid="button-register-webhook">{register.isPending ? 'Registering...' : 'Register webhook'}</button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Check connection only reads bot info from Telegram. Register webhook changes Telegram and uses the trusted public app URL; neither saves your settings.
            {!status.registrationAllowed && ' Registration is disabled outside the published production site, so it is unavailable in development.'}
          </p>
        </section>

        <section className={card} data-testid="card-behavior">
          <h2 className="text-base font-semibold">Behavior</h2>
          <Toggle testId="switch-enabled" label="Support bot enabled" hint={credsOk ? undefined : 'Requires both secrets to be configured.'} checked={draft.enabled} disabled={!credsOk && !draft.enabled} onChange={(v) => edit((d) => ({ ...d, enabled: v }))} />
          <Toggle testId="switch-auto-replies" label="Automatic FAQ replies" checked={draft.automaticRepliesEnabled} onChange={(v) => edit((d) => ({ ...d, automaticRepliesEnabled: v }))} />
          <Toggle testId="switch-contact" label="Contact Support button" checked={draft.contactSupportEnabled} onChange={(v) => edit((d) => ({ ...d, contactSupportEnabled: v }))} />
          <div className="mt-3">
            <label className="text-sm font-medium" htmlFor="support-url">Support account</label>
            <input id="support-url" className={`${input} mt-1 ${err(!!draft.enabled && draft.contactSupportEnabled && !draft.supportUrl?.trim())}`} placeholder="@username or https://t.me/username" value={draft.supportUrl ?? ''} onChange={(e) => edit((d) => ({ ...d, supportUrl: e.target.value }))} data-testid="input-support-url" />
            <p className="mt-1 text-xs text-muted-foreground">Used only by this bot. Separate from the website and Exchange contact links.</p>
          </div>
        </section>

        <section className={card} data-testid="card-welcome">
          <h2 className="text-base font-semibold">Welcome message</h2>
          <div className="mt-2"><LocaleTabs value={welcomeLocale} onChange={setWelcomeLocale} filled={(l) => !!draft.welcomeMessages[l]?.trim()} /></div>
          <textarea className={`${input} mt-3 min-h-28 ${err(welcomeLocale === 'en' && !draft.welcomeMessages.en?.trim())}`} dir={welcomeLocale === 'ar' ? 'rtl' : 'ltr'} maxLength={1000}
            value={draft.welcomeMessages[welcomeLocale] ?? ''} onChange={(e) => edit((d) => ({ ...d, welcomeMessages: { ...d.welcomeMessages, [welcomeLocale]: e.target.value } }))} data-testid="input-welcome" />
          <p className="mt-1 text-xs text-muted-foreground">Plain text. Blank languages fall back to English.</p>
          <div className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm whitespace-pre-wrap" data-testid="text-welcome-preview">{(draft.welcomeMessages[welcomeLocale] || draft.welcomeMessages.en || '').trim() || 'Nothing to preview yet.'}</div>
        </section>

        <section className={card} data-testid="card-categories">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Categories <span className="text-xs font-normal text-muted-foreground">({draft.categories.length}/20)</span></h2>
            <button className={btn} onClick={addCategory} disabled={draft.categories.length >= 20} data-testid="button-add-category">Add category</button>
          </div>
          {draft.categories.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No categories yet. Add one before creating FAQs.</p>}
          <div className="mt-3 space-y-3">
            {draft.categories.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3" data-testid={`row-category-${c.id}`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LOCALES.map((l) => (
                    <input key={l.code} className={`${input} ${err(l.code === 'en' && !c.label.en?.trim())}`} dir={l.code === 'ar' ? 'rtl' : 'ltr'} maxLength={60} placeholder={`${l.name}${l.code === 'en' ? ' (required)' : ''}`}
                      value={c.label[l.code] ?? ''} onChange={(e) => edit((d) => ({ ...d, categories: d.categories.map((x) => x.id === c.id ? { ...x, label: { ...x.label, [l.code]: e.target.value } } : x) }))} data-testid={`input-category-${c.id}-${l.code}`} />
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.enabled} onChange={(e) => edit((d) => ({ ...d, categories: d.categories.map((x) => x.id === c.id ? { ...x, enabled: e.target.checked } : x) }))} data-testid={`switch-category-${c.id}`} />Enabled</label>
                  <button className={btn} onClick={() => deleteCategory(c)} data-testid={`button-delete-category-${c.id}`}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={card} data-testid="card-faqs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">FAQs <span className="text-xs font-normal text-muted-foreground">({approvedCount} approved of {draft.faqs.length})</span></h2>
            <button className={btn} onClick={addFaq} disabled={!draft.categories.length || draft.faqs.length >= 100} data-testid="button-add-faq">Add FAQ</button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Only approved FAQs are used for replies. Editing an approved FAQ removes its approval until you approve it again.</p>
          {draft.faqs.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No FAQs yet. Nothing is answered automatically until you write and approve entries.</p>}
          <div className="mt-3 space-y-3">
            {draft.faqs.map((f) => {
              const open = editingFaq === f.id;
              const t = f.translations[faqLocale] ?? { question: '', answer: '', aliases: [] };
              return (
                <div key={f.id} className="rounded-lg border border-border p-3" data-testid={`row-faq-${f.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => setEditingFaq(open ? null : f.id)} data-testid={`button-toggle-faq-${f.id}`}>{f.translations.en?.question.trim() || 'Untitled FAQ'}</button>
                    <StatusPill ok={f.approved}>{f.approved ? 'Approved' : 'Not approved'}</StatusPill>
                  </div>
                  {open && (
                    <div className="mt-3 space-y-3">
                      <select className={input} value={f.categoryId} onChange={(e) => patchFaq(f.id, (x) => ({ ...x, categoryId: e.target.value }))} data-testid={`select-faq-category-${f.id}`}>
                        {draft.categories.map((c) => <option key={c.id} value={c.id}>{c.label.en || c.id}</option>)}
                      </select>
                      <LocaleTabs value={faqLocale} onChange={setFaqLocale} filled={(l) => !!f.translations[l]?.question.trim()} />
                      <input className={input} dir={faqLocale === 'ar' ? 'rtl' : 'ltr'} maxLength={200} placeholder="Question" value={t.question} onChange={(e) => setFaqText(f, 'question', e.target.value)} data-testid={`input-faq-question-${f.id}`} />
                      <textarea className={`${input} min-h-24`} dir={faqLocale === 'ar' ? 'rtl' : 'ltr'} maxLength={3500} placeholder="Answer" value={t.answer} onChange={(e) => setFaqText(f, 'answer', e.target.value)} data-testid={`input-faq-answer-${f.id}`} />
                      <textarea className={`${input} min-h-16`} placeholder="Aliases, one per line (max 10)" value={t.aliases.join('\n')} onChange={(e) => setFaqText(f, 'aliases', e.target.value)} data-testid={`input-faq-aliases-${f.id}`} />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={btn} onClick={() => patchFaq(f.id, (x) => ({ ...x, approved: !x.approved }), true)} data-testid={`button-approve-faq-${f.id}`}>{f.approved ? 'Unapprove' : 'Approve'}</button>
                    <button className={btn} onClick={() => { if (window.confirm('Delete this FAQ?')) edit((d) => ({ ...d, faqs: d.faqs.filter((x) => x.id !== f.id) })); }} data-testid={`button-delete-faq-${f.id}`}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

export default AdminTelegramSupportBotPage;
