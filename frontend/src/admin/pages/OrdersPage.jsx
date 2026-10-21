import OrderOperations from '../components/OrderOperations.jsx';
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api.js';
import { formatPaise, formatDateTime } from '../lib/format.js';
import { useResource } from '../lib/useResource.js';
import { useSession } from '../session/session-context.js';
import { PageHeader, Card, StatCard } from '../components/PageHeader.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { EmptyState, ErrorState } from '../components/Feedback.jsx';
import { Pill } from '../components/StatusPill.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormField, FormGrid } from '../components/FormField.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';

const statuses = ['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'return_requested', 'returned', 'cancelled', 'refunded'];
const label = value => String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
const tone = value => ['paid', 'delivered'].includes(value) ? 'ok' : ['failed', 'cancelled'].includes(value) ? 'danger' : ['pending', 'return_requested'].includes(value) ? 'warn' : 'info';

export default function OrdersPage() {
  const { role } = useSession();
  const { data, loading, error, reload } = useResource(() => adminApi.orders.list(), []);
  const orders = data ?? [];
  const [queue, setQueue] = useState('all');
  const [refunds, setRefunds] = useState([]), [webhookFailures, setWebhookFailures] = useState([]), [financialError, setFinancialError] = useState('');
  const loadFinancials = async () => {
    try {
      const [nextRefunds, nextEvents] = await Promise.all([adminApi.payments.refunds(), role === 'super_admin' ? adminApi.payments.webhookFailures() : Promise.resolve([])]);
      setRefunds(nextRefunds); setWebhookFailures(nextEvents); setFinancialError('');
    } catch (failure) { setFinancialError(failure.message); }
  };
  useEffect(() => { void loadFinancials(); }, [role]);
  useEffect(() => { const timer = window.setInterval(() => { void reload(); void loadFinancials(); }, 30000); return () => window.clearInterval(timer); }, [role, reload]);
  const inQueue = order => queue === 'all' || (queue === 'inbox' && order.operations?.fulfillment === 'unaccepted' && order.status !== 'cancelled') || (queue === 'fulfilment' && ['accepted', 'picking', 'packed', 'ready_to_dispatch'].includes(order.operations?.fulfillment)) || (queue === 'exceptions' && order.paymentReconciliationRequired) || (queue === 'returns' && (['return_requested', 'returned'].includes(order.status) || refunds.some(refund => refund.orderId === order.id && refund.status !== 'completed'))) || (queue === 'cod' && order.paymentMethod === 'cod' && order.operations?.shipment === 'delivered' && (order.operations?.codSettledPaise || 0) < order.totalPaise);

  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [payment, setPayment] = useState(''), [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState(null), [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState({ trackingNumber: '', trackingUrl: '' });
  const toast = useToast(), confirm = useConfirm();
  const selected = orders.find(order => order.id === selectedId);
  const filtered = orders.filter(order => inQueue(order) && `${order.id} ${order.customerName} ${order.customerEmail} ${order.customerPhone}`.toLowerCase().includes(search.trim().toLowerCase()) && (!status || order.status === status) && (!payment || order.paymentStatus === payment));
  const hasFilters = Boolean(search || status || payment);
  const clear = () => { setSearch(''); setStatus(''); setPayment(''); setOffset(0); };
  const open = order => { setSelectedId(order.id); setTracking({ trackingNumber: order.trackingNumber ?? '', trackingUrl: order.trackingUrl ?? '' }); };
  const mutate = async (action, message) => {
    setBusy(true);
    try { await action(); toast.success(message); await reload(); await loadFinancials(); return true; }
    catch (failure) { toast.error(failure.message); return false; }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    const reason = window.prompt('Cancellation reason (min. 3 characters)');
    if (!reason) return;
    if (reason.trim().length < 3) { toast.error('Enter a cancellation reason with at least 3 characters.'); return; }
    await mutate(() => adminApi.orders.cancel(selected.id, reason.trim()), 'Order cancelled.');
  };
  const refund = async () => {
    const reason = window.prompt('Refund reason (min. 3 characters)');
    if (!reason) return;
    if (reason.trim().length < 3) { toast.error('Enter a refund reason with at least 3 characters.'); return; }
    if (!await confirm({ title: 'Issue full refund?', message: `Refund ${formatPaise(selected.totalPaise)} for order ${selected.id} through Razorpay?`, confirmLabel: 'Issue refund', tone: 'danger' })) return;
    await mutate(() => adminApi.payments.refund(selected.id, reason.trim()), 'Refund request recorded. Check its processing status below.');
  };
  const statValue = value => loading || error ? '—' : value;

  return <div className="admin-orders-page">
    <PageHeader eyebrow="OPERATIONS" title="Orders" description="Track purchases, payments and deliveries in one place." actions={<button type="button" className="admin-btn admin-btn-ghost" disabled={loading || busy} onClick={reload}>↻ {loading ? 'Refreshing…' : 'Refresh orders'}</button>} />
    <div className="admin-stat-grid">
      <StatCard label="Total orders" value={statValue(orders.length)} hint="Across loaded orders" />
      <StatCard label="To fulfil" value={statValue(orders.filter(order => ['pending', 'confirmed', 'packed'].includes(order.status)).length)} hint="Pending, confirmed or packed" tone="warn" />
      <StatCard label="In transit" value={statValue(orders.filter(order => ['shipped', 'out_for_delivery'].includes(order.status)).length)} hint="Shipped or out for delivery" />
      <StatCard label="Delivered" value={statValue(orders.filter(order => order.status === 'delivered').length)} hint="Completed deliveries" tone="ok" />
    </div>
    <Card title="Order management" description="Find an order and open its details to manage the next step." actions={<span className="admin-hint">{loading || error ? '—' : `${filtered.length} orders`}</span>}>
      <div className="admin-order-actions">{[['all', 'All orders'], ['inbox', 'Order inbox'], ['fulfilment', 'Fulfilment'], ['exceptions', 'Payment exceptions'], ['returns', 'Returns & refunds'], ['cod', 'COD reconciliation']].map(([key, title]) => <button type="button" key={key} className={`admin-btn ${queue === key ? 'admin-btn-primary' : 'admin-btn-ghost'}`} onClick={() => { setQueue(key); setOffset(0); }}>{title}</button>)}</div>
      {financialError && <p role="alert" className="admin-alert admin-alert-error">Financial records could not be loaded: {financialError}</p>}
      {webhookFailures.length > 0 && <p className="admin-alert admin-alert-error" role="alert">{webhookFailures.length} payment webhook events are awaiting processing or recovery. {webhookFailures.filter(event => event.status === 'dead_letter').length} require technical review.</p>}
      <div className="admin-orders-filters">
        <FormField label="Search orders"><input className="admin-input" type="search" placeholder="Order ID, customer, email or phone…" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></FormField>
        <FormField label="Fulfilment"><select className="admin-input" value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></FormField>
        <FormField label="Payment"><select className="admin-input" value={payment} onChange={event => { setPayment(event.target.value); setOffset(0); }}><option value="">All payments</option>{['pending', 'paid', 'failed', 'refunded'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></FormField>
      </div>
      {hasFilters && <div className="admin-orders-filter-note"><span className="admin-hint">{filtered.length} matching orders</span><button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={clear}>Clear filters</button></div>}
      {error ? <ErrorState error={error} onRetry={reload} title="Orders could not be loaded" /> : <DataTable loading={loading} rows={filtered.slice(offset, offset + 20)} rowKey={order => order.id} caption="Customer orders with payment and fulfilment status" empty={<EmptyState icon="▣" title={hasFilters ? 'No matching orders' : 'Your orders will appear here'} description={hasFilters ? 'Try another search or clear the filters to see all orders.' : 'When customers place an order, you can review their purchase, track payment and manage delivery here.'} action={hasFilters ? <button type="button" className="admin-btn admin-btn-ghost" onClick={clear}>Clear filters</button> : null} />} columns={[
        { key: 'id', header: 'Order', render: order => <div className="admin-orders-cell"><button type="button" className="admin-orders-link" onClick={() => open(order)}>{order.id}</button><small>{formatDateTime(order.createdAt)}</small></div> },
        { key: 'customer', header: 'Customer', render: order => <div className="admin-orders-cell"><strong>{order.customerName}</strong><small>{order.customerEmail}</small></div> },
        { key: 'items', header: 'Items', render: order => `${order.lines?.reduce((sum, line) => sum + line.quantity, 0) ?? 0} units` },
        { key: 'total', header: 'Total', align: 'right', render: order => <strong>{formatPaise(order.totalPaise)}</strong> },
        { key: 'payment', header: 'Payment', render: order => <div className="admin-orders-cell"><Pill tone={tone(order.paymentStatus)}>{label(order.paymentStatus)}</Pill><small>{order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Razorpay'}</small></div> },
        { key: 'status', header: 'Fulfilment', render: order => <Pill tone={tone(order.status)}>{label(order.status)}</Pill> },
        { key: 'actions', header: 'Details', render: order => <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => open(order)}>View order →</button> },
      ]} />}
      {!loading && !error && filtered.length > 0 && <Pagination total={filtered.length} limit={20} offset={offset} onChange={setOffset} label="orders" />}
    </Card>
    <Modal open={Boolean(selected)} title={`Order ${selected?.id ?? ''}`} description={selected ? `Placed ${formatDateTime(selected.createdAt)}` : ''} size="lg" onClose={() => { if (!busy) setSelectedId(null); }} footer={<button type="button" className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => setSelectedId(null)}>Close</button>}>
      {selected && <>
        <div className="admin-order-status"><Pill tone={tone(selected.status)}>{label(selected.status)}</Pill><Pill tone={tone(selected.paymentStatus)}>Payment: {label(selected.paymentStatus)}</Pill><strong>{formatPaise(selected.totalPaise)}</strong></div>
        {selected.paymentReconciliationRequired && <p className="admin-alert admin-alert-error" role="alert">Payment reconciliation required: {selected.paymentReconciliationNote}</p>}
        <div className="admin-order-detail-grid"><section><h3>Customer</h3><p><strong>{selected.customerName}</strong><br />{selected.customerEmail}<br />{selected.customerPhone}</p></section><section><h3>Delivery address</h3><p>{selected.deliveryAddress?.street}<br />{selected.deliveryAddress?.landmark && <>{selected.deliveryAddress.landmark}<br /></>}{selected.deliveryAddress?.city}, {selected.deliveryAddress?.state} {selected.deliveryAddress?.pin}</p></section></div>
        <section className="admin-order-section"><h3>Items ordered</h3><DataTable rows={selected.lines ?? []} rowKey={line => `${line.productSlug}-${line.packSize}`} columns={[{ key: 'productName', header: 'Product' }, { key: 'packSize', header: 'Pack' }, { key: 'quantity', header: 'Quantity', align: 'right' }, { key: 'lineTotalPaise', header: 'Amount', align: 'right', render: line => formatPaise(line.lineTotalPaise) }]} /><dl className="admin-order-totals"><div><dt>Subtotal</dt><dd>{formatPaise(selected.subtotalPaise)}</dd></div><div><dt>Coupon discount</dt><dd>{formatPaise(selected.couponDiscountPaise ?? 0)}</dd></div><div><dt>Delivery</dt><dd>{formatPaise(selected.shippingPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(selected.totalPaise)}</dd></div></dl></section>
        <section className="admin-order-section"><h3>Shipment tracking</h3><form className="admin-stack" onSubmit={event => { event.preventDefault(); void mutate(() => adminApi.orders.updateStatus(selected.id, selected.status, tracking), 'Tracking saved.'); }}><FormGrid><FormField label="Tracking number"><input className="admin-input" value={tracking.trackingNumber} disabled={busy} placeholder="Carrier tracking number" onChange={event => setTracking({ ...tracking, trackingNumber: event.target.value })} /></FormField><FormField label="Tracking link"><input className="admin-input" type="url" disabled={busy} value={tracking.trackingUrl} placeholder="https://…" onChange={event => setTracking({ ...tracking, trackingUrl: event.target.value })} /></FormField></FormGrid><div><button className="admin-btn admin-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save tracking'}</button></div></form></section>
        <OrderOperations key={selected.id} order={selected} busy={busy} runAction={(action, payload) => mutate(() => adminApi.orders.action(selected.id, action, payload), 'Order action recorded.')} />
        <section className="admin-order-section"><h3>Payments & refunds</h3>
          {selected.paymentMethod === 'cod' && <p className="admin-hint">Delivery, cash collection and remittance are recorded separately. COD refunds currently require an external finance process.</p>}
          {refunds.filter(item => item.orderId === selected.id).map(item => <div key={item.requestId}><p><strong>Refund: {label(item.status)}</strong> · {formatPaise(item.amountPaise)}{item.providerRefundId && ` · ${item.providerRefundId}`}</p>{item.error && <p role="alert">{item.error}</p>}{role === 'super_admin' && item.status === 'failed' && <button className="admin-btn admin-btn-danger" disabled={busy} onClick={async () => { if (await confirm({ title: 'Retry failed refund?', message: 'The provider will be checked first. This creates a new attempt only if the previous refund definitively failed.', confirmLabel: 'Retry refund' })) await mutate(() => adminApi.payments.retryRefund(selected.id), 'New refund attempt recorded.'); }}>Retry confirmed failed refund</button>}{role === 'super_admin' && item.status !== 'completed' && <button className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => mutate(() => adminApi.payments.reconcileRefund(selected.id), 'Refund status checked.')}>Refresh refund status</button>}</div>)}
          {role === 'super_admin' && <div className="admin-order-actions">
            {selected.paymentMethod === 'razorpay' && <button className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => mutate(() => adminApi.payments.reconcile(selected.id), 'Provider payment checked.')}>Reconcile payment</button>}
            {['pending', 'confirmed', 'packed'].includes(selected.status) && <button className="admin-btn admin-btn-danger" disabled={busy} onClick={cancel}>Cancel order</button>}
            {['returned', 'cancelled'].includes(selected.status) && selected.paymentMethod === 'razorpay' && selected.paymentStatus === 'paid' && !refunds.some(item => item.orderId === selected.id) && <button className="admin-btn admin-btn-ghost" disabled={busy || Boolean(financialError)} onClick={refund}>Issue full refund</button>}
          </div>}
        </section>
        <section className="admin-order-section"><h3>Order timeline</h3>{selected.statusHistory?.length ? <ol className="admin-order-timeline">{selected.statusHistory.map((event, index) => <li key={index}><strong>{label(event.status)}</strong><time>{formatDateTime(event.at)}</time>{event.note && <p>{event.note}</p>}</li>)}</ol> : <p className="admin-hint">No status changes recorded yet.</p>}</section>
      </>}
    </Modal>
  </div>;
}
