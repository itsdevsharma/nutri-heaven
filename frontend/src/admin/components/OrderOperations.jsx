import { useState } from 'react';
import { FormField, FormGrid } from './FormField.jsx';
import { formatPaise, formatDateTime } from '../lib/format.js';
const labels = { accept: 'Accept order', pick: 'Start picking', pack: 'Mark packed', ready: 'Ready to dispatch', dispatch: 'Dispatch shipment', out_for_delivery: 'Out for delivery', deliver: 'Confirm delivery', approve_return: 'Approve return', reject_return: 'Reject return', receive_return: 'Receive return', inspect_return: 'Complete inspection', record_cod_collection: 'Record cash collection', record_cod_refund: 'Record completed COD refund', record_cod_settlement: 'Record courier remittance' };
const display = value => String(value || '—').replaceAll('_', ' ');
export default function OrderOperations({ order, busy, runAction }) {
  const [action, setAction] = useState('');
  const [details, setDetails] = useState({});
  const op = order.operations || {};
  const select = next => {
    setAction(next);
    setDetails({ idempotencyKey: crypto.randomUUID(), reason: '', courier: op.courier || '', trackingNumber: order.trackingNumber || '', trackingUrl: order.trackingUrl || '', reference: '', amount: ((['record_cod_collection', 'record_cod_refund'].includes(next) ? order.totalPaise : (op.codCollectedPaise || 0) - (op.codSettledPaise || 0)) / 100).toFixed(2), inspection: order.lines.map(line => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity, disposition: 'write_off', condition: 'opened' })) });
  };
  const update = (key, value) => setDetails(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const payload = { idempotencyKey: details.idempotencyKey, reason: details.reason };
    if (action === 'dispatch') Object.assign(payload, { courier: details.courier, trackingNumber: details.trackingNumber, ...(details.trackingUrl ? { trackingUrl: details.trackingUrl } : {}) });
    if (action === 'deliver' || action.startsWith('record_cod')) payload.reference = details.reference;
    if (action.startsWith('record_cod')) payload.amountPaise = Math.round(Number(details.amount) * 100);
    if (action === 'inspect_return') payload.inspection = details.inspection;
    if (await runAction(action, payload)) setAction('');
  };
  return <section className="admin-order-section"><h3>Operations</h3>
    <dl className="admin-order-totals"><div><dt>Fulfilment</dt><dd>{display(op.fulfillment)}</dd></div><div><dt>Shipment</dt><dd>{display(op.shipment)}</dd></div><div><dt>Return</dt><dd>{display(op.returnStatus)}</dd></div>{order.paymentMethod === 'cod' && <><div><dt>Cash collected</dt><dd>{formatPaise(op.codCollectedPaise || 0)}</dd></div><div><dt>Courier remittance received</dt><dd>{formatPaise(op.codSettledPaise || 0)}</dd></div><div><dt>Awaiting remittance</dt><dd>{formatPaise(Math.max(0, (op.codCollectedPaise || 0) - (op.codSettledPaise || 0)))}</dd></div></>}</dl>
    <div className="admin-order-actions">{(order.allowedActions || []).map(key => <button type="button" className="admin-btn admin-btn-ghost" key={key} disabled={busy} onClick={() => select(key)}>{labels[key]}</button>)}</div>
    {!(order.allowedActions || []).length && <p className="admin-hint">No operational action is currently available. Check payment exceptions, refunds or the completed order timeline.</p>}
    {action === 'record_cod_refund' && <p className="admin-hint">Record a refund only after transferring the full amount to the customer outside this website. This action records the transfer and does not send money.</p>}
    {action && <form className="admin-stack" onSubmit={submit}><h4>{labels[action]}</h4><FormField label="Reason / evidence"><textarea className="admin-input" required maxLength={2000} disabled={busy} value={details.reason} onChange={event => update('reason', event.target.value)} /></FormField>
      {action === 'dispatch' && <FormGrid>{[['courier', 'Courier'], ['trackingNumber', 'Tracking number'], ['trackingUrl', 'Tracking link (optional)']].map(([key, title]) => <FormField key={key} label={title}><input className="admin-input" required={key !== 'trackingUrl'} type={key === 'trackingUrl' ? 'url' : 'text'} disabled={busy} value={details[key]} onChange={event => update(key, event.target.value)} /></FormField>)}</FormGrid>}
      {(action === 'deliver' || action.startsWith('record_cod')) && <FormField label={action === 'deliver' ? 'Delivery evidence reference' : action === 'record_cod_refund' ? 'Completed refund transfer reference' : 'Collection / remittance reference'}><input className="admin-input" required disabled={busy} value={details.reference} onChange={event => update('reference', event.target.value)} /></FormField>}
      {action.startsWith('record_cod') && <FormField label={action === 'record_cod_refund' ? 'Amount refunded (₹)' : 'Amount received (₹)'}><input className="admin-input" type="number" required min="0.01" step="0.01" disabled={busy} value={details.amount} onChange={event => update('amount', event.target.value)} /></FormField>}
      {action === 'inspect_return' && <><p className="admin-hint">Inspect the complete returned order. Only sealed goods approved for resale may be restocked. Opened, damaged or expired goods must be written off.</p>{details.inspection.map((line, index) => <FormGrid key={index}><p>{line.productSlug} · {line.packSize} · {line.quantity} units</p><FormField label="Condition"><select className="admin-input" disabled={busy} value={line.condition} onChange={event => update('inspection', details.inspection.map((item, i) => i === index ? { ...item, condition: event.target.value, disposition: 'write_off' } : item))}>{['sealed', 'opened', 'damaged', 'expired'].map(value => <option key={value} value={value}>{display(value)}</option>)}</select></FormField><FormField label="Disposition"><select className="admin-input" disabled={busy} value={line.disposition} onChange={event => update('inspection', details.inspection.map((item, i) => i === index ? { ...item, disposition: event.target.value } : item))}><option value="write_off">Write off</option>{line.condition === 'sealed' && <option value="restock">Approved for resale</option>}</select></FormField></FormGrid>)}</>}
      <div className="admin-order-actions"><button className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Saving…' : labels[action]}</button><button type="button" className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => setAction('')}>Cancel</button></div>
    </form>}
    <details><summary>Activity history</summary><ol className="admin-order-timeline">{(order.activity || []).map((event, index) => <li key={index}><strong>{display(event.action)}</strong><time>{formatDateTime(event.at)}</time><p>{event.actor} · {event.reason}</p></li>)}</ol></details>
  </section>;
}
