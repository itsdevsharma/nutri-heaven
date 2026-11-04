import { useState } from 'react';
import { randomId } from '../../random-id.js';
import { FormField } from './FormField.jsx';
import { formatPaise, formatDateTime } from '../lib/format.js';

export default function OrderAmountOverride({ order, busy, save }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [originalTotal, setOriginalTotal] = useState(order.totalPaise);
  const [requestKey, setRequestKey] = useState('');
  const history = (order.activity ?? []).filter(event => event.action === 'override_amount');
  const start = () => {
    setAmount((order.totalPaise / 100).toFixed(2)); setReason(''); setError('');
    setOriginalTotal(order.totalPaise); setRequestKey(randomId()); setEditing(true);
  };
  const change = setter => event => { setter(event.target.value); setError(''); setRequestKey(randomId()); };
  const submit = async event => {
    event.preventDefault();
    const totalPaise = Math.round(Number(amount) * 100);
    const minimum = order.paymentMethod === 'razorpay' ? 100 : 1;
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(totalPaise) || totalPaise < minimum) { setError(`Enter an amount of at least ${formatPaise(minimum)} with up to two decimal places.`); return; }
    if (totalPaise === originalTotal) { setError('Enter an amount different from the current total.'); return; }
    if (reason.trim().length < 3) { setError('Enter a reason with at least 3 characters.'); return; }
    if (await save({ totalPaise, expectedTotalPaise: originalTotal, reason: reason.trim(), idempotencyKey: requestKey })) setEditing(false);
  };
  return <section className="admin-order-section">
    <h3>Final order total</h3>
    {order.amountOverrideBlockedReason ? <p className="admin-hint">{order.amountOverrideBlockedReason}</p> : !editing ? <><p className="admin-hint">Change the final amount payable for this order. The adjustment and your reason are saved in its history.</p><button type="button" className="admin-btn admin-btn-ghost" disabled={busy} onClick={start}>Override final total</button></> : <form className="admin-stack admin-operation-form" onSubmit={submit}>
      {order.paymentMethod === 'razorpay' && <p className="admin-hint">Ask the customer to close any open payment window before saving. Their next “Complete payment” action will use the revised total. The old checkout remains tracked for payment review.</p>}
      <p>Current total: <strong>{formatPaise(order.totalPaise)}</strong></p>
      {originalTotal !== order.totalPaise && <p role="alert" className="admin-alert admin-alert-error">The amount changed while you were editing. Go back and reopen the form.</p>}
      <FormField label="New order total (₹)" hint="Enter the final amount including delivery and discounts."><input aria-label="New order total (₹)" className="admin-input" type="number" min={order.paymentMethod === 'razorpay' ? '1' : '0.01'} step="0.01" required disabled={busy} value={amount} onChange={change(setAmount)} /></FormField>
      <FormField label="Reason for amount change"><textarea aria-label="Reason for amount change" className="admin-input" required minLength={3} maxLength={2000} rows={2} disabled={busy} value={reason} onChange={change(setReason)} /></FormField>
      {error && <p role="alert" className="admin-field-error">{error}</p>}
      <div className="admin-order-actions"><button className="admin-btn admin-btn-primary" disabled={busy || originalTotal !== order.totalPaise}>{busy ? 'Saving…' : 'Save amount override'}</button><button type="button" className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => setEditing(false)}>Go back</button></div>
    </form>}
    {history.length > 0 && <details className="admin-order-disclosure"><summary>Amount change history ({history.length})</summary><ol className="admin-order-timeline">{history.map((event, index) => <li key={index}><strong>{formatPaise(event.before?.totalPaise)} → {formatPaise(event.after?.totalPaise)}</strong><time>{formatDateTime(event.at)}</time><p>{event.actor} · {event.reason}</p></li>)}</ol></details>}
  </section>;
}
