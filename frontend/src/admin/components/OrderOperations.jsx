import { randomId } from '../../random-id.js';
import { useState } from 'react';
import { FormField, FormGrid } from './FormField.jsx';
import { formatPaise, formatDateTime } from '../lib/format.js';
const labels = { verify: 'Confirm all items are packed', accept: 'Accept this order', pick: 'Start collecting items', pack: 'Mark items as packed', ready: 'Mark ready for pickup', dispatch: 'Mark as handed to courier', out_for_delivery: 'Mark out for delivery', deliver: 'Confirm customer received order', approve_return: 'Approve return', reject_return: 'Reject return', receive_return: 'Record returned parcel', inspect_return: 'Check returned items', record_cod_collection: 'Record cash collected', record_cod_refund: 'Record money refunded to customer', record_cod_settlement: 'Record money received from courier' };
const explanations = {
  accept: 'Check the items, payment and delivery address above. Accept the order when you are ready to prepare it.',
  pick: 'Collect the products and pack sizes listed in this order. This records that preparation has started.',
  pack: 'Check each product and quantity, then pack the parcel securely. Confirm only when packing is finished.',
  ready: 'Confirm the packed parcel is ready for the courier to collect. You still need to arrange delivery below.',
  verify: 'Use this shortcut only when every item has already been checked and packed. It marks preparation complete and the parcel ready for pickup. It does not book delivery.',
  dispatch: 'Use this after the parcel has actually been handed to the courier. Enter the courier name and tracking number from the receipt.',
  out_for_delivery: 'Use this when the courier confirms the parcel is on its way to the customer today.',
  deliver: 'Confirm only after the customer has received the parcel. Record a delivery receipt or courier confirmation below.',
  approve_return: 'Approve the customer’s return request. This does not refund money or add items back to stock.',
  reject_return: 'Explain why the return request cannot be approved.',
  receive_return: 'Confirm the returned parcel has arrived. Check its contents before adding anything back to stock.',
  inspect_return: 'Check every returned item. Only sealed products suitable for resale may be added back to stock.',
  record_cod_collection: 'Record the cash the customer has already paid. This records a payment; it does not collect money.',
  record_cod_settlement: 'Record money the courier has already transferred to your business. Use the transfer reference from your bank statement.',
  record_cod_refund: 'First transfer the refund to the customer outside this website. Then record the amount and transfer reference here. This button does not send money.',
};
const display = value => String(value || '—').replaceAll('_', ' ');
export default function OrderOperations({ order, busy, runAction }) {
  const [action, setAction] = useState('');
  const [details, setDetails] = useState({});
  const op = order.operations || {};
  const available = order.allowedActions || [];
  const next = ['accept', 'pick', 'pack', 'ready', 'dispatch', 'out_for_delivery', 'deliver', 'approve_return', 'receive_return', 'inspect_return'].find(key => available.includes(key)) || available[0];
  const select = next => {
    setAction(next);
    setDetails({ idempotencyKey: randomId(), reason: ['accept', 'pick', 'pack', 'ready', 'verify'].includes(next) ? labels[next] + ' — checked by staff.' : '', courier: op.courier || '', trackingNumber: order.trackingNumber || '', trackingUrl: order.trackingUrl || '', reference: '', amount: ((['record_cod_collection', 'record_cod_refund'].includes(next) ? order.totalPaise : (op.codCollectedPaise || 0) - (op.codSettledPaise || 0)) / 100).toFixed(2), inspection: order.lines.map(line => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity, disposition: 'write_off', condition: 'opened' })) });
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
  return <section className="admin-order-section admin-order-preparation"><h3>1. Prepare the order</h3>
    <p className="admin-hint">Current stage: <strong>{({ unaccepted: 'Waiting for you to accept', picking: 'Collecting items', ready_to_dispatch: 'Ready for courier pickup' })[op.fulfillment] || display(op.fulfillment)}</strong></p>
    {next && !action && <div className="admin-next-action"><p>{explanations[next]}</p><button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={() => select(next)}>{labels[next]}</button></div>}
    {available.length > 1 && !action && <details className="admin-order-disclosure"><summary>More order actions</summary><p className="admin-hint">Use these for a packing shortcut, returns or money you have already received or refunded.</p><div className="admin-order-actions">{available.filter(key => key !== next).map(key => <button type="button" className="admin-btn admin-btn-ghost" key={key} disabled={busy} onClick={() => select(key)}>{labels[key]}</button>)}</div></details>}
    {!(order.allowedActions || []).length && <p className="admin-hint">No operational action is currently available. Check payment exceptions, refunds or the completed order timeline.</p>}
    {action === 'record_cod_refund' && <p className="admin-hint">Record a refund only after transferring the full amount to the customer outside this website. This action records the transfer and does not send money.</p>}
    {action && <form className="admin-stack admin-operation-form" onSubmit={submit}><h4>{labels[action]}</h4><p className="admin-hint">{explanations[action]}</p><FormField label="Note for your team" hint="This note is saved in the order history. Add what you checked or explain the change."><textarea aria-label="Note for your team" className="admin-input" required minLength={3} maxLength={2000} rows={2} disabled={busy} value={details.reason} onChange={event => update('reason', event.target.value)} /></FormField>
      {action === 'dispatch' && <FormGrid>{[['courier', 'Courier'], ['trackingNumber', 'Tracking number'], ['trackingUrl', 'Tracking link (optional)']].map(([key, title]) => <FormField key={key} label={title}><input aria-label={title} className="admin-input" required={key !== 'trackingUrl'} type={key === 'trackingUrl' ? 'url' : 'text'} disabled={busy} value={details[key]} onChange={event => update(key, event.target.value)} /></FormField>)}</FormGrid>}
      {(action === 'deliver' || action.startsWith('record_cod')) && <FormField label={action === 'deliver' ? 'Delivery receipt or confirmation number' : action === 'record_cod_refund' ? 'Completed refund transfer reference' : 'Payment receipt or bank transfer reference'}><input className="admin-input" required disabled={busy} value={details.reference} onChange={event => update('reference', event.target.value)} /></FormField>}
      {action.startsWith('record_cod') && <FormField label={action === 'record_cod_refund' ? 'Amount refunded (₹)' : 'Amount received (₹)'}><input className="admin-input" type="number" required min="0.01" step="0.01" disabled={busy} value={details.amount} onChange={event => update('amount', event.target.value)} /></FormField>}
      {action === 'inspect_return' && <><p className="admin-hint">Inspect the complete returned order. Only sealed goods approved for resale may be restocked. Opened, damaged or expired goods must be written off.</p>{details.inspection.map((line, index) => <FormGrid key={index}><p>{line.productSlug} · {line.packSize} · {line.quantity} units</p><FormField label="Condition"><select className="admin-input" disabled={busy} value={line.condition} onChange={event => update('inspection', details.inspection.map((item, i) => i === index ? { ...item, condition: event.target.value, disposition: 'write_off' } : item))}>{['sealed', 'opened', 'damaged', 'expired'].map(value => <option key={value} value={value}>{display(value)}</option>)}</select></FormField><FormField label="What should happen to these items?"><select className="admin-input" disabled={busy} value={line.disposition} onChange={event => update('inspection', details.inspection.map((item, i) => i === index ? { ...item, disposition: event.target.value } : item))}><option value="write_off">Do not return to stock</option>{line.condition === 'sealed' && <option value="restock">Return sealed items to stock</option>}</select></FormField></FormGrid>)}</>}
      <div className="admin-order-actions"><button className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Confirm: ' + labels[action]}</button><button type="button" className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => setAction('')}>Go back</button></div>
    </form>}
    <details className="admin-order-disclosure"><summary>Staff activity & cash records</summary><dl className="admin-order-totals"><div><dt>Delivery stage</dt><dd>{display(op.shipment)}</dd></div><div><dt>Return</dt><dd>{display(op.returnStatus)}</dd></div>{order.paymentMethod === 'cod' && <><div><dt>Cash collected from customer</dt><dd>{formatPaise(op.codCollectedPaise || 0)}</dd></div><div><dt>Received from courier</dt><dd>{formatPaise(op.codSettledPaise || 0)}</dd></div><div><dt>Still owed by courier</dt><dd>{formatPaise(Math.max(0, (op.codCollectedPaise || 0) - (op.codSettledPaise || 0)))}</dd></div></>}</dl><ol className="admin-order-timeline">{(order.activity || []).map((event, index) => <li key={index}><strong>{labels[event.action] || display(event.action)}</strong><time>{formatDateTime(event.at)}</time><p>{event.actor} · {event.reason}</p></li>)}</ol></details>
  </section>;
}
