import { useState } from 'react';
import {
  Banknote,
  Bell,
  Check,
  CheckCircle2,
  Code,
  Eye,
  FileText,
  Mail,
  Play,
  Save,
  Send,
  Settings2,
  Smartphone,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import './_group.css';
import './Redesign.css';

type TemplateKind = 'order_created' | 'payment_received' | 'processing' | 'completed' | 'failed_cancelled';
type NotificationEmailTemplate = {
  eventKind: TemplateKind;
  subject: string;
  heading: string;
  message: string;
  buttonText: string;
  footerText: string;
};
type Settings = Record<string, boolean | string>;

const initialSettings: Settings = {
  adminNotificationsEnabled: true,
  adminEmailEnabled: true,
  emailEnabled: true,
  telegramEnabled: true,
  adminEmailOrderCreatedEnabled: false,
  adminEmailPaymentReceivedEnabled: true,
  adminEmailProcessingEnabled: true,
  adminEmailCompletedEnabled: true,
  adminEmailFailedCancelledEnabled: true,
  adminTelegramOrderCreatedEnabled: false,
  adminTelegramPaymentReceivedEnabled: true,
  adminTelegramProcessingEnabled: true,
  adminTelegramCompletedEnabled: true,
  adminTelegramFailedCancelledEnabled: true,
  customerEmailOrderCreatedEnabled: true,
  customerEmailPaymentReceivedEnabled: true,
  customerEmailProcessingEnabled: true,
  customerEmailCompletedEnabled: true,
  customerEmailFailedCancelledEnabled: false,
  adminNotificationEmail: 'admin@quickchange.exchange',
  adminNotificationPhone: '+213 555 123 456',
  adminTelegramChatId: '8421937651',
  adminTelegramUsername: 'quickxchange_ops',
  trustpilotReviewUrl: 'https://www.trustpilot.com/review/quickchange.exchange',
};

const initialTemplates: NotificationEmailTemplate[] = [
  { eventKind: 'order_created', subject: 'Your QuickXchange Order {{orderId}}', heading: 'Order Received!', message: 'We have received your order {{orderId}} and are waiting for payment.', buttonText: 'View Order', footerText: 'Thank you for choosing QuickXchange!' },
  { eventKind: 'payment_received', subject: 'Payment received for {{orderId}}', heading: 'Payment Received', message: 'Your payment has been detected and is now being processed.', buttonText: 'Track Order', footerText: 'QuickXchange Support' },
  { eventKind: 'processing', subject: 'Your exchange is processing', heading: 'We’re on it!', message: 'Your exchange is now being processed. We’ll send another update soon.', buttonText: 'View Order', footerText: 'Thank you for choosing QuickXchange!' },
  { eventKind: 'completed', subject: 'Your exchange is complete', heading: 'Exchange Completed!', message: 'Your exchange is complete. Thank you for using QuickXchange!', buttonText: 'View Order', footerText: 'We appreciate your business.' },
  { eventKind: 'failed_cancelled', subject: 'An update about order {{orderId}}', heading: 'Order Update', message: 'Your exchange has failed or been cancelled. Please contact our support team if you need assistance.', buttonText: 'Contact Support', footerText: 'QuickXchange Support' },
];

const events: { kind: TemplateKind; title: string; description: string }[] = [
  { kind: 'order_created', title: 'Order Created', description: 'Awaiting funds notification' },
  { kind: 'payment_received', title: 'Payment Received', description: 'Authoritative deposit confirmed' },
  { kind: 'processing', title: 'Order Processing', description: 'Execution has begun' },
  { kind: 'completed', title: 'Order Completed', description: 'Funds successfully dispatched' },
  { kind: 'failed_cancelled', title: 'Failed / Cancelled', description: 'Order aborted or failed' },
];

const variables = [
  '{{customerName}}', '{{orderId}}', '{{sendAmount}}', '{{sendAsset}}',
  '{{sendNetwork}}', '{{receiveAmount}}', '{{receiveAsset}}', '{{receiveMethod}}',
  '{{status}}', '{{createdDate}}', '{{completedDate}}', '{{orderUrl}}',
  '{{invoiceUrl}}', '{{trustpilotUrl}}',
];

function renderTemplatePreview(text: string) {
  return text
    .replace(/\{\{orderId\}\}/g, 'QX1254F7')
    .replace(/\{\{customerName\}\}/g, 'Islam')
    .replace(/\{\{sendAmount\}\}/g, '500')
    .replace(/\{\{sendAsset\}\}/g, 'USDT')
    .replace(/\{\{sendNetwork\}\}/g, 'TRC20')
    .replace(/\{\{receiveAmount\}\}/g, '465')
    .replace(/\{\{receiveAsset\}\}/g, 'EUR')
    .replace(/\{\{receiveMethod\}\}/g, 'SEPA')
    .replace(/\{\{status\}\}/g, 'Processing')
    .replace(/\{\{createdDate\}\}/g, 'Sep 21, 2026 14:20')
    .replace(/\{\{completedDate\}\}/g, 'Sep 21, 2026 14:48')
    .replace(/\{\{orderUrl\}\}/g, 'https://quickchange.exchange/status')
    .replace(/\{\{invoiceUrl\}\}/g, 'https://quickchange.exchange/status?invoice=1')
    .replace(/\{\{trustpilotUrl\}\}/g, 'https://www.trustpilot.com/review/quickchange.exchange');
}

export function Redesign() {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const theme = new URLSearchParams(search).get('theme') === 'light' ? 'light' : 'dark';
  const openEditorOnLoad = new URLSearchParams(search).get('templates') === '1';
  const [draft, setDraft] = useState<Settings>(initialSettings);
  const [saveMessage, setSaveMessage] = useState('');
  const [testResult, setTestResult] = useState<{ type: 'email' | 'telegram' | 'template'; success: boolean; message: string } | null>(null);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(openEditorOnLoad);
  const [selectedTemplateKind, setSelectedTemplateKind] = useState<TemplateKind>('order_created');
  const [templatesDraft, setTemplatesDraft] = useState<NotificationEmailTemplate[]>(initialTemplates);

  const set = (key: string, value: boolean | string) => {
    setDraft(current => ({ ...current, [key]: value }));
    setSaveMessage('');
  };
  const save = () => setSaveMessage('Settings saved successfully.');
  const showDemoResult = (type: 'email' | 'telegram' | 'template') => {
    setTestResult({ type, success: true, message: 'Demo preview — no message was sent.' });
  };
  const hasTgConnection = Boolean(draft.adminTelegramChatId);
  const activeTemplate = templatesDraft.find(template => template.eventKind === selectedTemplateKind) ?? initialTemplates[0];
  const customerEmailExamples = [
    { key: 'customerEmailOrderCreatedEnabled', title: 'Order Created', color: 'text-blue-400', message: 'We have received your order and it is now waiting for payment.', status: 'Waiting for payment', state: 'bg-muted text-foreground' },
    { key: 'customerEmailPaymentReceivedEnabled', title: 'Payment Received', color: 'text-emerald-400', message: 'Your payment has been detected and is now being processed.', status: 'Payment Received', state: 'bg-emerald-500/20 text-emerald-400' },
    { key: 'customerEmailProcessingEnabled', title: 'Processing', color: 'text-purple-400', message: 'We are now processing your exchange. You will receive another update soon.', status: 'Processing', state: 'bg-purple-500/20 text-purple-400' },
    { key: 'customerEmailCompletedEnabled', title: 'Completed / Done', color: 'text-emerald-400', message: 'Your exchange is completed! Thank you for using QuickXchange!', status: 'Completed', state: 'bg-emerald-500/20 text-emerald-400' },
    { key: 'customerEmailFailedCancelledEnabled', title: 'Failed / Cancelled', color: 'text-red-400', message: 'Your exchange has failed or been cancelled.', status: 'Failed / Cancelled', state: 'bg-red-500/20 text-red-400' },
  ];
  const updateActiveTemplate = (field: keyof NotificationEmailTemplate, value: string) => {
    setTemplatesDraft(current => current.map(template => template.eventKind === selectedTemplateKind
      ? { ...template, [field]: value }
      : template));
  };

  return (
    <div className={`admin-shell admin-redesign ${theme === 'dark' ? 'dark' : ''}`} data-theme={theme}>
      <div className="qx-notif-page max-w-7xl mx-auto">
        <div className="qx-notif-topbar flex flex-col sm:flex-row sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Notification Settings</h1>
            <p className="text-sm text-slate-400">Control when and how you receive notifications</p>
          </div>
          <div className="flex items-center gap-4">
            {saveMessage && <span role="status" className={`qx-notif-status text-xs font-medium ${saveMessage.includes('Unable') || saveMessage.includes('Failed') ? 'is-error' : ''}`}>{saveMessage}</span>}
            <button className="qx-notif-btn qx-notif-btn-primary" onClick={save}><Save className="mr-2 h-4 w-4" />SAVE NOTIFICATION SETTINGS</button>
          </div>
        </div>

        <div className="qx-notif-layout">
          <div>
            {/* Admin Notifications Matrix */}
            <div className="qx-notif-card">
              <div className="qx-notif-card-header">
                <div>
                  <h2 className="text-[15px] font-bold text-white flex items-center gap-2"><Bell size={18} className="text-blue-400" />Admin Notifications</h2>
                  <p className="text-xs text-slate-400 mt-1">Choose which events should trigger notifications.</p>
                </div>
                <button className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${draft.adminNotificationsEnabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`} onClick={() => set('adminNotificationsEnabled', !draft.adminNotificationsEnabled)}>
                  {draft.adminNotificationsEnabled ? <Check size={14} /> : <X size={14} />}
                  <span className="text-xs font-semibold">{draft.adminNotificationsEnabled ? 'Notifications are enabled' : 'Notifications are disabled'}</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="qx-notif-table">
                  <thead><tr><th className="w-1/2">Event</th><th>Email</th><th>Telegram</th></tr></thead>
                  <tbody>
                    {[
                      ['New Order (Created)', 'Optional — enable only if you want notifications for unpaid/new orders.', <FileText size={16} className="text-slate-400" />, 'adminEmailOrderCreatedEnabled', 'adminTelegramOrderCreatedEnabled'],
                      ['Payment Received', '', <Banknote size={16} className="text-slate-400" />, 'adminEmailPaymentReceivedEnabled', 'adminTelegramPaymentReceivedEnabled'],
                      ['Order Processing', '', <Settings2 size={16} className="text-slate-400" />, 'adminEmailProcessingEnabled', 'adminTelegramProcessingEnabled'],
                      ['Order Completed', '', <CheckCircle2 size={16} className="text-slate-400" />, 'adminEmailCompletedEnabled', 'adminTelegramCompletedEnabled'],
                      ['Order Failed / Cancelled', '', <XCircle size={16} className="text-slate-400" />, 'adminEmailFailedCancelledEnabled', 'adminTelegramFailedCancelledEnabled'],
                    ].map(([title, description, icon, emailKey, telegramKey]) => (
                      <tr key={String(title)}>
                        <td><div className="flex items-center gap-3">{icon}<div><span className="text-sm font-medium text-white block">{title}</span>{description && <span className="text-[10px] text-slate-500">{description}</span>}</div></div></td>
                        <td><Toggle label={`${String(title)} admin email`} checked={Boolean(draft[String(emailKey)])} onChange={value => set(String(emailKey), value)} /></td>
                        <td><Toggle label={`${String(title)} admin Telegram`} checked={Boolean(draft[String(telegramKey)])} onChange={value => set(String(telegramKey), value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config Cards */}
            <div className="qx-notif-channels">
              <div className="qx-notif-channel-stack">
              {/* Admin Email */}
              <div className="qx-notif-card">
                <div className="qx-notif-card-header border-b-0 pb-0">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><Mail size={16} className="text-slate-400" />Admin Email</h3>
                  <Toggle label="Admin email notifications" checked={Boolean(draft.adminEmailEnabled)} onChange={value => set('adminEmailEnabled', value)} />
                </div>
                <div className="qx-notif-card-body pt-2">
                  <p className="text-[11px] text-slate-400 mb-3">Receive notifications at this email address</p>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Admin notification email</label>
                  <div className="relative"><Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className="qx-notif-input qx-notif-input-icon" placeholder="admin@quickchange.exchange" value={String(draft.adminNotificationEmail ?? '')} onChange={event => set('adminNotificationEmail', event.target.value)} /></div>
                  {Boolean(initialSettings.adminNotificationEmail) && <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1"><Check size={11} />Email address saved (delivery not yet tested)</div>}
                  {String(draft.adminNotificationEmail ?? '').trim() !== String(initialSettings.adminNotificationEmail ?? '').trim() && <p className="mt-2 text-[10px] text-amber-300">Save this address before sending a test email.</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <button className="qx-notif-btn qx-notif-btn-secondary flex items-center gap-1" onClick={save}><Save size={12} />Save</button>
                    <button className="qx-notif-btn qx-notif-btn-secondary ml-auto flex items-center gap-1" onClick={() => showDemoResult('email')}><Play size={12} />Send Test Email</button>
                  </div>
                  {testResult?.type === 'email' && <span role="status" className={`qx-notif-status mt-2 text-[10px] flex items-center gap-1 ${testResult.success ? '' : 'is-error'}`}><Check size={12} />{testResult.message}</span>}
                </div>
              </div>

              {/* Trustpilot */}
              <div className="qx-notif-card">
                <div className="qx-notif-card-header border-b-0 pb-0"><h3 className="text-sm font-bold text-white flex items-center gap-2"><Star size={16} className="text-emerald-400" />Trustpilot</h3></div>
                <div className="qx-notif-card-body pt-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Trustpilot Review URL</label>
                  <p className="text-[11px] text-slate-400 mb-3">Shown to customers only after Completed / Done.</p>
                  <input className="qx-notif-input" placeholder="https://www.trustpilot.com/review/..." value={String(draft.trustpilotReviewUrl ?? '')} onChange={event => set('trustpilotReviewUrl', event.target.value)} />
                </div>
              </div>
              </div>

              {/* Telegram Notifications */}
              <div className="qx-notif-card">
                <div className="qx-notif-card-header border-b-0 pb-0">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><Send size={16} className="text-blue-400" />Telegram Notifications</h3>
                  <Toggle label="Admin Telegram notifications" checked={Boolean(draft.telegramEnabled && hasTgConnection)} onChange={value => set('telegramEnabled', value)} disabled={!hasTgConnection} />
                </div>
                <div className="qx-notif-card-body pt-2">
                  <p className="text-[11px] text-slate-400 mb-3">Connect the bot in a private chat, then enable and save the events you want to receive.</p>
                  <div className="mb-3 space-y-1 text-[10px] text-slate-300" role="status"><p>Verified bot: @quickxchange_alerts</p><p>Webhook configured and ready for new connection links.</p></div>
                  <div className="space-y-2 mb-2">
                    <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Telegram Phone Number</span><div className="relative mt-1"><Smartphone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className="qx-notif-input qx-notif-input-icon text-sm" placeholder="+213 555 000 000" value={String(draft.adminNotificationPhone ?? '')} onChange={event => set('adminNotificationPhone', event.target.value)} /></div></label>
                    <label className="block"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Telegram Chat ID</span><div className="relative mt-1"><Send size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className="qx-notif-input qx-notif-input-icon text-sm" placeholder="Not connected" value={draft.adminTelegramChatId ? '********' + String(draft.adminTelegramChatId).slice(-4) : ''} readOnly /></div></label>
                  </div>
                  {hasTgConnection ? (
                    <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-2">
                      <div className="text-[10px] text-emerald-400 flex items-center gap-1"><Check size={11} />Telegram chat linked — use Send Test Telegram to confirm delivery</div>
                      <div className="text-[10px] text-slate-400">Phone: {String(draft.adminNotificationPhone || 'Not provided')}</div>
                      {Boolean(draft.adminTelegramUsername) && <div className="text-[10px] text-slate-400">Username: @{String(draft.adminTelegramUsername)}</div>}
                      <div className="text-[10px] text-slate-400">Chat ID: ********{String(draft.adminTelegramChatId).slice(-4)}</div>
                      <div className="flex items-center justify-between gap-2">
                        <button className="qx-notif-btn qx-notif-btn-outline text-red-400" onClick={() => { set('adminTelegramChatId', ''); set('telegramEnabled', false); }}>Disconnect</button>
                        <button className="qx-notif-btn qx-notif-btn-secondary flex items-center gap-1" onClick={() => showDemoResult('telegram')}><Play size={10} />Send Test Telegram</button>
                      </div>
                    </div>
                  ) : <button className="qx-notif-btn qx-notif-btn-secondary mt-2 flex items-center gap-1" onClick={() => set('adminTelegramChatId', '8421937651')}><Send size={12} />Connect Telegram</button>}
                  {!hasTgConnection && <p className="mt-2 text-[10px] text-amber-300">No Admin Telegram chat is linked. Telegram alerts cannot be sent until connection succeeds.</p>}
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">Phone number is contact information only and is never used as a Telegram Chat ID.</p>
                  {testResult?.type === 'telegram' && <div role="status" className={`qx-notif-status mt-2 text-[10px] flex items-center gap-1 ${testResult.success ? '' : 'is-error'}`}><Check size={11} />{testResult.message}</div>}
                </div>
              </div>

            </div>

            {/* Customer Email Notifications */}
            <div className="qx-notif-card">
              <div className="qx-notif-card-header">
                <div className="flex items-center gap-3"><div className="bg-blue-500/20 p-2 rounded-full"><Mail size={20} className="text-blue-400" /></div><div><h2 className="text-[15px] font-bold text-white">Customer Email Notifications (Examples)</h2><p className="text-xs text-slate-400">Manage what emails customers receive.</p></div></div>
                <div className="flex items-center gap-4">
                  <button className="qx-notif-btn qx-notif-btn-secondary text-xs py-1.5 h-8" onClick={() => setIsTemplatesOpen(true)}><Code size={14} className="mr-2" />Edit Templates</button>
                  <div className="flex items-center gap-2"><span className="text-xs font-semibold text-slate-300">Master Switch</span><Toggle label="Customer email notifications" checked={Boolean(draft.emailEnabled)} onChange={value => set('emailEnabled', value)} /></div>
                </div>
              </div>
              <div className="qx-notif-card-body">
                <div className="qx-preview-grid">
                  {customerEmailExamples.map((example, index) => (
                      <div key={index} className={`qx-preview-card flex flex-col transition-all duration-300 ${!draft[example.key] ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between mb-4"><span className="text-xs font-semibold text-slate-300">{example.title}</span><Toggle label={`${example.title} customer email`} checked={Boolean(draft[example.key])} onChange={value => set(example.key, value)} /></div>
                      <div className="qx-email-sample flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800"><div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center"><span className="text-blue-400 font-bold text-[10px]">QX</span></div><span className="text-sm font-bold text-white">QuickXchange</span></div>
                        <h4 className="text-lg font-bold text-white mb-2">Hello User,</h4>
                        <p className={`text-sm font-semibold mb-2 ${example.color}`}>{example.title}!</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-6">{example.message}</p>
                        <div className="mt-auto space-y-2 mb-4">
                          <div className="flex justify-between text-[10px]"><span className="text-slate-500">Order ID</span><span className="text-slate-300 font-mono">QX1254F7</span></div>
                          <div className="flex justify-between text-[10px]"><span className="text-slate-500">Status</span><span className={`px-2 py-0.5 rounded-full font-semibold ${example.state}`}>{example.status}</span></div>
                        </div>
                        <div className="qx-notif-sample-action w-full">View Order →</div>
                        {example.key === 'customerEmailCompletedEnabled' && <div className="mt-2 grid gap-2"><div className="qx-notif-sample-action is-secondary w-full">Download Invoice / PDF</div><div className="qx-notif-sample-action is-success w-full">Review us on Trustpilot</div></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Admin Telegram Preview */}
          <div className="qx-telegram-sample">
            <div className="qx-notif-card">
              <div className="qx-notif-card-header"><h3 className="text-sm font-bold text-white flex items-center gap-2"><Send size={16} className="text-blue-400" />Telegram Notification (Admin)</h3></div>
              <div className="qx-notif-card-body">
                <div className="qx-telegram-message rounded-xl">
                  <div className="flex items-center gap-2 mb-4"><div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center"><span className="text-white font-bold text-[10px]">QX</span></div><span className="text-sm font-bold text-white">QuickXchange Bot</span></div>
                  <div className="space-y-3">
                    <h4 className="text-[15px] font-bold text-emerald-400 flex items-center gap-2"><CheckCircle2 size={16} />Order Payment Received</h4>
                    <p className="text-[13px] text-slate-300">A payment has been received!</p>
                    <div className="bg-slate-900/50 rounded-lg p-3 space-y-2 border border-slate-800">
                      <PreviewRow label="Order ID:" value="QX1254F7" blue />
                      <PreviewRow label="Customer:" value="user@example.com" />
                      <PreviewRow label="You Send:" value="500 USDT (TRC20)" />
                      <PreviewRow label="You Receive:" value="465 EUR (SEPA)" />
                      <PreviewRow label="Status:" value="Payment Received" green />
                    </div>
                    <div className="qx-notif-sample-action w-full mt-4">Open Order</div>
                    <div className="text-right text-[10px] text-slate-500 mt-1">14:32</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Email Templates Editor Dialog */}
        <Dialog open={isTemplatesOpen} onOpenChange={setIsTemplatesOpen}>
          <DialogContent className="qx-notif-dialog p-0" data-theme={theme}>
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div><DialogTitle className="text-lg font-bold text-white flex items-center gap-2"><Code size={18} className="text-blue-400" />Email Templates Editor</DialogTitle><DialogDescription className="text-xs text-slate-400 mt-1">Customize the content of transactional emails sent to customers.</DialogDescription></div>
              <div className="flex items-center gap-3">
                {testResult?.type === 'template' && <span role="status" className={`text-xs font-medium ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>{testResult.message}</span>}
                <button className="qx-notif-btn qx-notif-btn-secondary text-xs h-8 py-0" type="button" onClick={() => document.querySelector('.qx-template-preview')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}><Eye size={14} className="mr-2" />Preview Email</button>
                <button className="qx-notif-btn qx-notif-btn-secondary text-xs h-8 py-0" onClick={() => showDemoResult('template')}><Play size={14} className="mr-2" />Send Test</button>
                <button className="qx-notif-btn qx-notif-btn-primary text-xs h-8 py-0" onClick={() => setTestResult({ type: 'template', success: true, message: 'Templates saved locally.' })}><Save size={14} className="mr-2" />Save Templates</button>
              </div>
            </div>
            <div className="qx-template-editor">
              <div className="qx-template-sidebar p-4 bg-slate-900/20">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 px-2">Events</h4>
                <div className="space-y-1">{events.map(event => <button type="button" key={event.kind} className="qx-template-item block w-full text-left" data-active={selectedTemplateKind === event.kind} onClick={() => setSelectedTemplateKind(event.kind)}><div className="text-sm font-bold text-slate-200">{event.title}</div><div className="text-[10px] text-slate-500 mt-1">{event.description}</div></button>)}</div>
                <div className="mt-8 px-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Available Variables</h4>
                  <div className="flex flex-wrap gap-2">{variables.map(variable => <button type="button" key={variable} className="qx-variable-badge" title="Template variable" onClick={() => updateActiveTemplate('message', `${activeTemplate.message} ${variable}`)}>{variable}</button>)}</div>
                  <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">Click a variable to insert it. Variables will be replaced with real order data when emails are sent.</p>
                </div>
              </div>
              <div className="qx-template-main p-6">
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="qx-form-group"><label className="qx-form-label">Email Subject</label><input className="qx-notif-input" value={activeTemplate.subject} onChange={event => updateActiveTemplate('subject', event.target.value)} placeholder="e.g. Your QuickXchange Order {{orderId}}" /></div>
                  <div className="qx-form-group"><label className="qx-form-label">Heading</label><input className="qx-notif-input font-bold" value={activeTemplate.heading} onChange={event => updateActiveTemplate('heading', event.target.value)} placeholder="e.g. Order Received!" /></div>
                  <div className="qx-form-group"><label className="qx-form-label">Message Body</label><textarea className="qx-notif-input qx-textarea font-mono text-sm leading-relaxed" value={activeTemplate.message} onChange={event => updateActiveTemplate('message', event.target.value)} placeholder="e.g. We have received your order {{orderId}} and are waiting for payment..." /></div>
                  <div className="grid grid-cols-2 gap-4"><div className="qx-form-group"><label className="qx-form-label">Button Text</label><input className="qx-notif-input" value={activeTemplate.buttonText} onChange={event => updateActiveTemplate('buttonText', event.target.value)} placeholder="e.g. View Order" /></div><div className="qx-form-group"><label className="qx-form-label">Footer Text</label><input className="qx-notif-input text-xs" value={activeTemplate.footerText} onChange={event => updateActiveTemplate('footerText', event.target.value)} placeholder="e.g. Thank you for choosing QuickXchange!" /></div></div>
                </div>
              </div>
              <div className="qx-template-preview p-6 bg-slate-900/10">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Preview</h4>
                <div className="qx-template-email bg-white rounded-lg text-slate-900">
                  <div className="flex justify-center mb-6 border-b pb-6 border-slate-200"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center"><span className="text-white font-bold text-xs">QX</span></div><span className="text-xl font-bold text-slate-900">QuickXchange</span></div></div>
                  <h1 className="text-2xl font-bold mb-4">{activeTemplate.heading || 'Heading'}</h1>
                  <div className="text-[15px] leading-relaxed text-slate-600 mb-8 whitespace-pre-wrap">{activeTemplate.message ? renderTemplatePreview(activeTemplate.message) : 'Message body will appear here...'}</div>
                  {activeTemplate.buttonText && <div className="mb-8"><span className="qx-notif-sample-action">{activeTemplate.buttonText}</span></div>}
                  {activeTemplate.footerText && <div className="text-xs text-slate-400 border-t border-slate-200 pt-6 mt-6">{activeTemplate.footerText}</div>}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled = false, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="qx-notif-toggle" data-state={checked ? 'checked' : 'unchecked'} disabled={disabled} onClick={() => onChange(!checked)}><span className="qx-notif-toggle-thumb" /></button>;
}

function PreviewRow({ label, value, blue = false, green = false }: { label: string; value: string; blue?: boolean; green?: boolean }) {
  return <div className="flex items-start gap-2 text-[12px]"><span className="text-slate-400 w-24 flex-shrink-0">{label}</span><span className={`${blue ? 'text-blue-400' : green ? 'text-emerald-400' : 'text-slate-200'} ${blue ? 'font-mono' : ''} ${!green ? 'break-all' : 'font-semibold'}`}>{value}</span></div>;
}