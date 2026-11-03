import { customerApi } from '../cart-api.js';
const money = value => `₹${(value / 100).toLocaleString('en-IN')}`;
const label = value => String(value ?? '').replaceAll('_', ' ');
const payable = order => order.paymentMethod === 'razorpay' && order.status === 'pending' && ['pending', 'failed'].includes(order.paymentStatus) && order.stockReserved && !order.paymentReconciliationRequired;

function paymentMessage(order) {
  if (order.paymentStatus === 'refunded') return 'Your payment has been refunded.';
  if (order.paymentReconciliationRequired) return 'Your payment needs a review. Contact support with this order number before paying again.';
  if (order.status === 'cancelled' && order.paymentStatus === 'paid') return 'This order was cancelled after payment. Contact support with your order number to follow up on the refund.';
  if (order.paymentStatus === 'paid') return 'Payment received. No further payment is due.';
  if (order.status === 'cancelled') return 'This order was cancelled. To purchase these items, place a new order.';
  if (order.paymentMethod === 'cod') return `Cash on delivery: pay ${money(order.totalPaise)} when your order arrives.`;
  if (payable(order)) return `Complete your online payment of ${money(order.totalPaise)} to confirm this order.`;
  return 'This order is no longer available for online payment. Contact support if you have already paid.';
}

export default function CustomerOrders({ orders, busy, run, reload, onPayOrder }) {
  return <section className="account-card" id="account-orders">
    <div className="account-orders-heading"><h2>Orders</h2><button type="button" disabled={busy} onClick={() => run(reload, 'Orders refreshed.')}>Refresh orders</button></div>
    <p className="account-section-description">Open an order to see its items, payment and delivery details. Complete payment for unpaid online orders below. Guest orders can be resumed from checkout in the browser used to place them.</p>
    {orders.length ? orders.map(order => <details className="customer-order" key={order.id} open={payable(order) || undefined}>
      <summary><span className="account-order-reference"><small>Order number</small><b>{order.id}</b><small>{order.paymentMethod === 'cod' ? 'Cash on delivery' : order.paymentStatus === 'paid' ? 'Paid online' : payable(order) ? 'Online payment required' : `Online payment · ${label(order.paymentStatus)}`}</small></span><span className="account-order-amount">{money(order.totalPaise)}</span><span className={`account-order-badge status-${order.status}`}>{label(order.status)}</span><span className="account-order-chevron" aria-hidden="true">⌄</span></summary>
      <p className="account-order-payment">{paymentMessage(order)}</p>
      <div className="customer-actions">
        {payable(order) && <button type="button" className="account-pay-order" disabled={busy} onClick={() => run(() => onPayOrder(order))}>Complete payment · {money(order.totalPaise)}</button>}
        <button type="button" disabled={busy} onClick={() => run(async () => { await customerApi.downloadReceipt(order.id); }, 'Receipt downloaded. Open it to print or save as PDF.')}>Download receipt</button>
        {['pending', 'confirmed', 'packed'].includes(order.status) && <button type="button" disabled={busy} onClick={() => { const reason = window.prompt('Why would you like to cancel this order?'); if (reason) run(async () => { await customerApi.orderAction(order.id, 'cancel', reason); await reload(); }, order.paymentMethod === 'cod' ? 'Order cancelled.' : 'Order cancelled. If you paid online, support will arrange the refund.'); }}>Cancel order</button>}
        {order.status === 'delivered' && <button type="button" disabled={busy} onClick={() => { const reason = window.prompt('Tell us why you would like to return this order.'); if (reason) run(async () => { await customerApi.orderAction(order.id, 'return', reason); await reload(); }, 'Return request sent. Our team will review it.'); }}>Request return</button>}
      </div>
      <div className="account-order-items">{order.lines.map(line => <p key={`${line.productSlug}-${line.packSize}`}><strong>{line.productName}</strong> ({line.packSize}) × {line.quantity}<span>{money(line.lineTotalPaise)}</span>{order.status === 'delivered' && <a href={`/products/${encodeURIComponent(line.productSlug)}#product-reviews`}>Write a review</a>}</p>)}</div>
      <dl className="account-order-breakdown"><div><dt>Subtotal</dt><dd>{money(order.subtotalPaise)}</dd></div>{order.couponDiscountPaise > 0 && <div><dt>Discount</dt><dd>−{money(order.couponDiscountPaise)}</dd></div>}<div><dt>Delivery</dt><dd>{money(order.shippingPaise)}</dd></div>{Boolean(order.amountAdjustmentPaise) && <div><dt>Order adjustment</dt><dd>{money(order.amountAdjustmentPaise)}</dd></div>}<div><dt>Total</dt><dd>{money(order.totalPaise)}</dd></div></dl>
      <p><strong>Delivering to</strong><br />{order.deliveryAddress.street}, {order.deliveryAddress.city} {order.deliveryAddress.pin}</p>
      {order.trackingNumber && <p>Tracking: {order.trackingNumber}</p>}{/^https?:\/\//i.test(order.trackingUrl ?? '') && <a href={order.trackingUrl} target="_blank" rel="noreferrer">Track shipment ↗</a>}
      <details className="account-order-history"><summary>Order history</summary><ol>{order.statusHistory?.map((event, index) => <li key={index}>{label(event.status)} · {new Date(event.at).toLocaleString('en-IN')}</li>)}</ol></details>
      {order.status === 'cancelled' && <a className="account-browse-link" href="/shop">Shop again →</a>}
    </details>) : <p>No orders yet. Orders placed while signed in appear here.</p>}
  </section>;
}
