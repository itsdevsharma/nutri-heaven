import OrderAmountOverride from '../components/OrderAmountOverride.jsx';
import OrderDelivery from '../components/OrderDelivery.jsx';
import '../order-workflow.css';
import OrderOperations from '../components/OrderOperations.jsx';
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api.js';
import { formatPaise, formatDateTime } from '../lib/format.js';
import { useDebounced, useResource } from '../lib/useResource.js';
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
  const [queue, setQueue] = useState('all');
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [payment, setPayment] = useState(''), [offset, setOffset] = useState(0);
  const q = useDebounced(search, 250);
  const { data, loading, error, reload } = useResource(() => adminApi.orders.list({ queue, q: q.trim() || undefined, status: status || undefined, payment: payment || undefined, limit: 20, offset }), [queue, q, status, payment, offset]);
  const orders = data?.items ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary ?? {};
  const [selectedId, setSelectedId] = useState(null), [busy, setBusy] = useState(false);
  const { data: financialData, loading: financialLoading, error: financialFailure, reload: loadFinancials } = useResource(() => Promise.all([selectedId ? adminApi.payments.refunds({ orderId: selectedId }) : Promise.resolve([]), role === 'super_admin' ? adminApi.payments.webhookFailures() : Promise.resolve([])]), [role, selectedId]);
  const refunds = financialData?.[0] ?? [], webhookFailures = financialData?.[1] ?? [], financialError = financialFailure?.message ?? '';
  const { data: detail, error: detailError, reload: reloadDetail } = useResource(() => selectedId ? adminApi.orders.get(selectedId) : Promise.resolve(null), [selectedId]);
  const refreshOrders = async () => { await reload(); if (selectedId) await reloadDetail(); };
  useEffect(() => { const timer = window.setInterval(() => { void reload(); if (selectedId) void reloadDetail(); void loadFinancials(); }, 30000); return () => window.clearInterval(timer); }, [role, reload, reloadDetail, selectedId, loadFinancials]);
  useEffect(() => { if (!loading && !error && offset > 0 && offset >= total) setOffset(total ? Math.floor((total - 1) / 20) * 20 : 0); }, [loading, error, offset, total]);
  const [tracking, setTracking] = useState({ trackingNumber: '', trackingUrl: '' });
  const toast = useToast(), confirm = useConfirm();
  const selected = detail?.id === selectedId ? detail : orders.find(order => order.id === selectedId);
  const hasFilters = Boolean(search || status || payment);
  const clear = () => { setSearch(''); setStatus(''); setPayment(''); setOffset(0); };
  const open = order => { setSelectedId(order.id); setTracking({ trackingNumber: order.trackingNumber ?? '', trackingUrl: order.trackingUrl ?? '' }); };
  const mutate = async (action, message) => {
    setBusy(true);
    try { await action(); toast.success(message); await refreshOrders(); await loadFinancials(); return true; }
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
    if (!await confirm({ title: 'Issue full refund?', message: `Refund ${formatPaise(selected.capturedAmountPaise ?? selected.totalPaise)} for order ${selected.id} through Razorpay?`, confirmLabel: 'Issue refund', tone: 'danger' })) return;
    await mutate(() => adminApi.payments.refund(selected.id, reason.trim()), 'Refund request recorded. Check its processing status below.');
  };
  const statValue = value => loading || error ? '—' : value;

  return <div className="admin-orders-page">
    <PageHeader eyebrow="OPERATIONS" title="Orders" description="Track purchases, payments and deliveries in one place." actions={<button type="button" className="admin-btn admin-btn-ghost" disabled={loading || busy} onClick={refreshOrders}>↻ {loading ? 'Refreshing…' : 'Refresh orders'}</button>} />
    <div className="admin-stat-grid">
      <StatCard label="Total orders" value={statValue(summary.totalOrders ?? 0)} hint="Across all orders" />
      <StatCard label="To fulfil" value={statValue(summary.toFulfil ?? 0)} hint="Pending, confirmed or packed" tone="warn" />
      <StatCard label="In transit" value={statValue(summary.inTransit ?? 0)} hint="Shipped or out for delivery" />
      <StatCard label="Delivered" value={statValue(summary.delivered ?? 0)} hint="Completed deliveries" tone="ok" />
    </div>
    <Card title="Order management" description="Find an order and open its details to manage the next step." actions={<span className="admin-hint">{loading || error ? '—' : `${total} orders`}</span>}>
      <div className="admin-order-actions">{[['all', 'All orders'], ['inbox', 'Order inbox'], ['fulfilment', 'Fulfilment'], ['exceptions', 'Payment exceptions'], ['returns', 'Returns & refunds'], ['cod', 'COD reconciliation']].map(([key, title]) => <button type="button" key={key} className={`admin-btn ${queue === key ? 'admin-btn-primary' : 'admin-btn-ghost'}`} onClick={() => { setQueue(key); setOffset(0); }}>{title}</button>)}</div>
      {financialError && <p role="alert" className="admin-alert admin-alert-error">Financial records could not be loaded: {financialError}</p>}
      {webhookFailures.length > 0 && <p className="admin-alert admin-alert-error" role="alert">{webhookFailures.length} payment webhook events are awaiting processing or recovery. {webhookFailures.filter(event => event.status === 'dead_letter').length} require technical review.</p>}
      <div className="admin-orders-filters">
        <FormField label="Search orders"><input aria-label="Search orders" className="admin-input" type="search" placeholder="Order ID, customer, email or phone…" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></FormField>
        <FormField label="Fulfilment"><select aria-label="Fulfilment" className="admin-input" value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></FormField>
        <FormField label="Payment"><select aria-label="Payment" className="admin-input" value={payment} onChange={event => { setPayment(event.target.value); setOffset(0); }}><option value="">All payments</option>{['pending', 'paid', 'failed', 'refunded'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></FormField>
      </div>
      {hasFilters && <div className="admin-orders-filter-note"><span className="admin-hint">{total} matching orders</span><button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={clear}>Clear filters</button></div>}
      {error ? <ErrorState error={error} onRetry={reload} title="Orders could not be loaded" /> : <DataTable loading={loading} rows={orders} rowKey={order => order.id} caption="Customer orders with payment and fulfilment status" empty={<EmptyState icon="▣" title={hasFilters ? 'No matching orders' : 'Your orders will appear here'} description={hasFilters ? 'Try another search or clear the filters to see all orders.' : 'When customers place an order, you can review their purchase, track payment and manage delivery here.'} action={hasFilters ? <button type="button" className="admin-btn admin-btn-ghost" onClick={clear}>Clear filters</button> : null} />} columns={[
        { key: 'id', header: 'Order', render: order => <div className="admin-orders-cell"><button type="button" className="admin-orders-link" onClick={() => open(order)}>{order.id}</button><small>{formatDateTime(order.createdAt)}</small></div> },
        { key: 'customer', header: 'Customer', render: order => <div className="admin-orders-cell"><strong>{order.customerName}</strong><small>{order.customerEmail}</small></div> },
        { key: 'items', header: 'Items', render: order => `${order.lines?.reduce((sum, line) => sum + line.quantity, 0) ?? 0} units` },
        { key: 'total', header: 'Total', align: 'right', render: order => <strong>{formatPaise(order.totalPaise)}</strong> },
        { key: 'payment', header: 'Payment', render: order => <div className="admin-orders-cell"><Pill tone={tone(order.paymentStatus)}>{label(order.paymentStatus)}</Pill><small>{order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Razorpay'}</small></div> },
        { key: 'status', header: 'Fulfilment', render: order => <Pill tone={tone(order.status)}>{label(order.status)}</Pill> },
        { key: 'actions', header: 'Details', render: order => <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => open(order)}>View order →</button> },
      ]} />}
      {!loading && !error && total > 0 && <Pagination total={total} limit={20} offset={offset} onChange={setOffset} label="orders" />}
    </Card>
    <Modal open={Boolean(selectedId)} title={`Order ${selected?.id ?? selectedId ?? ''}`} description={selected ? `Placed ${formatDateTime(selected.createdAt)}` : ''} size="lg" onClose={() => { if (!busy) setSelectedId(null); }} footer={<button type="button" className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => setSelectedId(null)}>Close</button>}>
      {!selected && !detailError && <p role="status">Loading order details…</p>}
      {detailError && <ErrorState error={detailError} onRetry={reloadDetail} title="Order details could not be refreshed" />}
      {selected && <>
        <div className="admin-order-status"><Pill tone={tone(selected.status)}>{label(selected.status)}</Pill><Pill tone={tone(selected.paymentStatus)}>Payment: {label(selected.paymentStatus)}</Pill><strong>{formatPaise(selected.totalPaise)}</strong></div>
        {selected.paymentReconciliationRequired && <p className="admin-alert admin-alert-error" role="alert">Payment reconciliation required: {selected.paymentReconciliationNote}</p>}
        <div className="admin-order-detail-grid"><section><h3>Customer</h3><p><strong>{selected.customerName}</strong><br />{selected.customerEmail}<br />{selected.customerPhone}</p></section><section><h3>Delivery address</h3><p>{selected.deliveryAddress?.street}<br />{selected.deliveryAddress?.landmark && <>{selected.deliveryAddress.landmark}<br /></>}{selected.deliveryAddress?.city}, {selected.deliveryAddress?.state} {selected.deliveryAddress?.pin}</p></section></div>
        <section className="admin-order-section"><h3>Items ordered</h3><DataTable rows={selected.lines ?? []} rowKey={line => `${line.productSlug}-${line.packSize}`} columns={[{ key: 'productName', header: 'Product' }, { key: 'packSize', header: 'Pack' }, { key: 'quantity', header: 'Quantity', align: 'right' }, { key: 'lineTotalPaise', header: 'Amount', align: 'right', render: line => formatPaise(line.lineTotalPaise) }]} /><dl className="admin-order-totals"><div><dt>Subtotal</dt><dd>{formatPaise(selected.subtotalPaise)}</dd></div><div><dt>Coupon discount</dt><dd>{formatPaise(selected.couponDiscountPaise ?? 0)}</dd></div><div><dt>Delivery</dt><dd>{formatPaise(selected.shippingPaise)}</dd></div>{Boolean(selected.amountAdjustmentPaise) && <div><dt>Admin adjustment</dt><dd>{formatPaise(selected.amountAdjustmentPaise)}</dd></div>}<div><dt>Total</dt><dd>{formatPaise(selected.totalPaise)}</dd></div></dl></section>
        {role === 'super_admin' && <OrderAmountOverride key={`amount-${selected.id}`} order={selected} busy={busy} save={payload => mutate(() => adminApi.orders.overrideAmount(selected.id, payload), 'Order amount updated.')} />}
        <OrderOperations key={selected.id} order={selected} busy={busy} runAction={(action, payload) => mutate(() => adminApi.orders.action(selected.id, action, payload), 'Order updated.')} />
        <OrderDelivery key={`delivery-${selected.id}`} order={selected} tracking={tracking} setTracking={setTracking} busy={busy} setBusy={setBusy} reload={refreshOrders} save={() => mutate(() => adminApi.orders.updateStatus(selected.id, selected.status, tracking), 'Tracking details saved.')} />
        <details className="admin-order-section admin-order-disclosure"><summary>Payments, refunds & cancellation</summary><p className="admin-hint">Review payments, cancel an order or manage a refund. Open this only when you need to make a payment correction.</p>
          {financialLoading && <p role="status">Loading refund records…</p>}
          {selected.paymentMethod === 'cod' && <p className="admin-hint">For cash-on-delivery orders, record delivery, the cash collected and the money received from the courier separately. If you refund a customer yourself, record the transfer under “More order actions” after sending the money.</p>}
          {refunds.filter(item => item.orderId === selected.id).map(item => <div key={item.requestId}><p><strong>Refund: {label(item.status)}</strong> · {formatPaise(item.amountPaise)}{item.providerRefundId && ` · ${item.providerRefundId}`}</p>{item.error && <p role="alert">{item.error}</p>}{role === 'super_admin' && item.status === 'failed' && <button className="admin-btn admin-btn-danger" disabled={busy} onClick={async () => { if (await confirm({ title: 'Retry failed refund?', message: 'The provider will be checked first. This creates a new attempt only if the previous refund definitively failed.', confirmLabel: 'Retry refund' })) await mutate(() => adminApi.payments.retryRefund(selected.id), 'New refund attempt recorded.'); }}>Retry confirmed failed refund</button>}{role === 'super_admin' && item.status !== 'completed' && <button className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => mutate(() => adminApi.payments.reconcileRefund(selected.id), 'Refund status checked.')}>Refresh refund status</button>}</div>)}
          {role === 'super_admin' && <div className="admin-order-actions">
            {selected.paymentMethod === 'razorpay' && <button className="admin-btn admin-btn-ghost" disabled={busy} onClick={() => mutate(() => adminApi.payments.reconcile(selected.id), 'Provider payment checked.')}>Check payment with Razorpay</button>}
            {['pending', 'confirmed', 'packed'].includes(selected.status) && <button className="admin-btn admin-btn-danger" disabled={busy} onClick={cancel}>Cancel order</button>}
            {['returned', 'cancelled'].includes(selected.status) && selected.paymentMethod === 'razorpay' && selected.paymentStatus === 'paid' && !refunds.some(item => item.orderId === selected.id) && <button className="admin-btn admin-btn-ghost" disabled={busy || financialLoading || Boolean(financialError)} onClick={refund}>Issue full refund</button>}
          </div>}
        </details>
        <details className="admin-order-section admin-order-disclosure"><summary>Order history</summary>{selected.statusHistory?.length ? <ol className="admin-order-timeline">{selected.statusHistory.map((event, index) => <li key={index}><strong>{label(event.status)}</strong><time>{formatDateTime(event.at)}</time>{event.note && <p>{event.note}</p>}</li>)}</ol> : <p className="admin-hint">No status changes recorded yet.</p>}</details>
      </>}
    </Modal>
  </div>;
}
