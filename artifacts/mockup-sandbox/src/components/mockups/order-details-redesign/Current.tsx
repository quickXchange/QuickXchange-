import { useState } from 'react';
import { Activity, Archive, ArrowLeft, ArrowRight, Check, CircleGauge, History, LayoutDashboard, Settings, ShoppingCart, UserRound, UsersRound } from 'lucide-react';
import './_group.css';

const history = [
  { action: 'Settlement status updated', actor: 'maya.chen@novaswap.io', detail: 'funds_confirmed → payout_processing', time: 'Jan 22, 2025, 10:18:42 AM' },
  { action: 'Order updated', actor: 'maya.chen@novaswap.io', detail: 'Incoming reference: 8f2c1d…91a7', time: 'Jan 22, 2025, 10:17:09 AM' },
  { action: 'Assignment updated', actor: 'ops@novaswap.io', detail: 'Assignee: maya.chen@novaswap.io', time: 'Jan 22, 2025, 9:46:31 AM' },
  { action: 'Order created', actor: 'Customer', detail: 'Manual settlement order opened', time: 'Jan 22, 2025, 9:42:16 AM' },
];

function SettlementCard({ receive = false }: { receive?: boolean }) {
  const rows = receive
    ? [['Amount', '41,278.46 USDC'], ['Network / payment method', 'Polygon'], ['Destination address', '0x71C4e8A33d29aBA7C9e26B4Bf89b7F2c6eB841D3'], ['Settlement speed', 'Same business day'], ['Quote rate', '1 BTC = 42,122.92 USDC']]
    : [['Amount', '0.9825 BTC'], ['Network / payment method', 'Bitcoin'], ['Deposit address', 'bc1q9v7z4jzfh0ml7c2krk3wq0wpcckzh4f8u62eqa'], ['Refund address', 'bc1qp0az8xg6le8xewyut9xyywqp8j6vkgzx44j8cq'], ['Required confirmations', '3 network confirmations']];
  return <section className="settlement-card">
    <header><span>{receive ? '02' : '01'}</span><div><small>{receive ? 'CUSTOMER RECEIVES' : 'CUSTOMER SENDS'}</small><h2>{receive ? 'Receive details' : 'Send details'}</h2></div></header>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}

export function Current() {
  const [status, setStatus] = useState('payout_processing');
  const [assignee, setAssignee] = useState('maya');
  const [incoming, setIncoming] = useState('8f2c1d9a004c93d62f71d5a1826de80bfc3a91a7');
  const [outgoing, setOutgoing] = useState('');
  const [customerNote, setCustomerNote] = useState('Your Bitcoin deposit has been confirmed. We are preparing your USDC payout.');
  const [note, setNote] = useState('Source of funds reviewed. Priority client; complete payout before 14:00 UTC.');

  return <div className="order-details-current">
    <aside className="od-sidebar">
      <div className="od-brand"><span className="od-brand-symbol"><i /></span>Nova<b>Swap</b></div>
      <p className="od-sidebar-label">OPERATIONS</p>
      <nav>
        <span className="od-sidebar-link"><LayoutDashboard size={16} /> Dashboard</span>
        <span className="od-sidebar-link active"><ShoppingCart size={16} /> Orders <em>12</em></span>
        <span className="od-sidebar-link"><UsersRound size={16} /> Customers</span>
        <span className="od-sidebar-link"><CircleGauge size={16} /> Providers</span>
        <span className="od-sidebar-link"><History size={16} /> Audit log</span>
        <span className="od-sidebar-link"><Settings size={16} /> Settings</span>
      </nav>
      <div className="od-sidebar-bottom"><div className="od-online"><i /><div><strong>Systems operational</strong><small>All services online</small></div></div></div>
    </aside>
    <div className="od-content">
      <header className="od-header">
        <div className="od-heading"><span className="section-kicker">OPERATIONS / ORDER DETAILS</span><h1>Order 7E4A19C2</h1></div>
        <div className="od-header-actions">
          <button className="button button-secondary"><ArrowLeft size={15} /> Back to orders</button>
          <div className="od-user"><span>MC</span><div><strong>Maya Chen</strong><small>Owner</small></div></div>
        </div>
      </header>
      <main className="od-main">
        <section className="panel order-identity">
          <div><span className="section-kicker">SWAP ORDER</span><h2>BTC <ArrowRight size={18} /> USDC</h2><p>ord_01JH6TQ8Y7E4A19C2B5MVPK3ND</p></div>
          <div className="order-identity-meta">
            <div><span>Created</span><strong>Jan 22, 2025, 9:42:16 AM</strong></div>
            <div><span>Customer</span><strong>Daniel Ortiz</strong><small>daniel.ortiz@example.com</small></div>
            <div><span>Assigned operator</span><strong>maya.chen@novaswap.io</strong></div>
          </div>
        </section>
        <section className="panel order-progress">
          <div className="panel-heading"><div><span className="section-kicker">STATUS PROGRESSION</span><h2>Settlement progress</h2></div><span className="status-pill"><i /> Payout processing</span></div>
          <div className="operations-timeline">
            {['Awaiting funds', 'Funds confirmed', 'Payout processing', 'Payout sent', 'Completed'].map((label, index) => <div className={`operations-step ${index < 2 ? 'complete' : index === 2 ? 'current' : ''}`} key={label}><span>{index < 2 ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></div>)}
          </div>
        </section>
        <div className="settlement-stack"><SettlementCard /><SettlementCard receive /></div>
        <div className="order-operations-grid">
          <section className="panel order-controls">
            <div className="panel-heading"><div><span className="section-kicker">OPERATIONS</span><h2>Manage order</h2></div></div>
            <div className="control-block">
              <label><span className="field-label">Assigned operator</span><select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Unassigned</option><option value="maya">maya.chen@novaswap.io · owner</option><option value="jon">jon.bell@novaswap.io · operator</option></select></label>
              <button className="button button-secondary"><UserRound size={15} /> Update assignment</button>
            </div>
            <div className="control-block">
              <label><span className="field-label">Settlement status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="payout_processing">Payout processing</option><option value="payout_sent">Payout sent</option><option value="completed">Completed</option></select><p className="field-hint">You can move directly to any later status. Skipped milestones are recorded when you save.</p></label>
              <label><span className="field-label">Incoming transaction reference</span><input value={incoming} onChange={e => setIncoming(e.target.value)} /></label>
              <label><span className="field-label">Outgoing transaction reference</span><input value={outgoing} onChange={e => setOutgoing(e.target.value)} placeholder="Add payout transaction hash" /></label>
              <label><span className="field-label">Customer-safe note</span><textarea rows={3} value={customerNote} onChange={e => setCustomerNote(e.target.value)} /></label>
            </div>
            <label><span className="field-label">Internal note</span><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></label>
            <button className="button button-primary button-wide"><Check size={15} /> Save changes</button>
            <button className="button button-danger button-wide"><Archive size={15} /> Archive order</button>
          </section>
          <section className="panel order-history">
            <div className="panel-heading"><div><span className="section-kicker">IMMUTABLE HISTORY</span><h2>Order activity</h2></div><span className="history-count">{history.length}</span></div>
            <ol className="history-timeline">{history.map(event => <li key={event.time}><span><Activity size={13} /></span><div><strong>{event.action}</strong><p>{event.actor}</p><small>{event.detail}</small><time>{event.time}</time></div></li>)}</ol>
          </section>
        </div>
      </main>
    </div>
  </div>;
}