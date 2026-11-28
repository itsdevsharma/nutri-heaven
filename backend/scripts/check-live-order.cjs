// Read-only acceptance check. Never creates/captures/refunds a payment or changes stock.
// Run from backend: node --env-file=.env scripts/check-live-order.cjs ORDER_ID [--expect-refunded]
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
async function main() {
  const orderId = process.argv[2];
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId || '')) throw new Error('Provide an order ID, optionally followed by --expect-refunded.');
  if (!process.env.MONGODB_URI || !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new Error('Run with the backend environment file.');
  const refunded = process.argv.includes('--expect-refunded');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    const db = mongoose.connection.db;
    const order = await db.collection('orders').findOne({ id: orderId });
    if (!order || order.paymentMethod !== 'razorpay') throw new Error('Order not found or is not an online Razorpay order.');
    const client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, result: ok ? 'PASS' : 'WAIT_OR_REVIEW', detail });
    const payment = order.razorpayPaymentId ? await client.payments.fetch(order.razorpayPaymentId) : null;
    check('Matching captured payment', Boolean(payment && ['captured', 'refunded'].includes(payment.status) && payment.amount === order.totalPaise && payment.currency === 'INR' && payment.order_id === order.razorpayOrderId), { paymentId: order.razorpayPaymentId || null, providerStatus: payment?.status || null, expectedPaise: order.totalPaise });
    check('Local payment and order state', refunded ? order.paymentStatus === 'refunded' && order.status === 'refunded' : order.paymentStatus === 'paid' && order.status === 'confirmed', { order: order.status, payment: order.paymentStatus });
    check('No payment exception', !order.paymentReconciliationRequired, {});
    const events = await db.collection('payment_webhook_events').find({ 'payload.payload.payment.entity.order_id': order.razorpayOrderId }).toArray();
    check('Provider payment webhook processed', events.some(event => event.payload?.event === 'payment.captured' && event.status === 'completed'), { events: events.map(event => ({ event: event.payload?.event, status: event.status })) });
    const moves = await db.collection('inventory_movements').find({ referenceId: orderId }).toArray();
    const grouped = new Map();
    for (const line of order.lines) { const key = `${line.productSlug}:${line.packSize}`; grouped.set(key, (grouped.get(key) || 0) + line.quantity); }
    const inventory = [...grouped].map(([key, quantity]) => {
      const rows = moves.filter(move => `${move.productSlug}:${move.packSize}` === key);
      const reserved = rows.filter(row => row.type === 'order-reserved');
      const committed = rows.filter(row => row.type === 'order-committed');
      const cancelled = rows.filter(row => row.type === 'cancelled');
      return { pack: key, ok: reserved.length === 1 && reserved[0].quantity === -quantity && committed.length === 1 && committed[0].quantity === 0 && (!refunded || cancelled.length === 1 && cancelled[0].quantity === quantity) };
    });
    check('Stock deducted once; restored once after cancellation/refund', inventory.length > 0 && inventory.every(pack => pack.ok), inventory);
    const notifications = await db.collection('customer_notifications').find({ eventKey: { $regex: `^${orderId}:` }, emailRequested: true }).toArray();
    const pendingOutbox = await db.collection('order_outbox').countDocuments({ orderId, status: { $ne: 'delivered' } });
    check('Order emails accepted by provider', !pendingOutbox && notifications.length > 0 && notifications.every(item => item.sentAt), { pendingOutbox, messages: notifications.length, awaitingAcceptance: notifications.filter(item => !item.sentAt).length, inboxReceiptRequiresCustomerCheck: true });
    if (refunded) {
      const refund = await db.collection('order_refunds').findOne({ orderId });
      const remote = refund?.providerRefundId && payment ? await client.payments.fetchRefund(payment.id, refund.providerRefundId) : null;
      check('Single full refund processed', Boolean(refund?.status === 'completed' && remote?.status === 'processed' && remote.payment_id === order.razorpayPaymentId && remote.amount === order.totalPaise && order.refundedPaise === order.totalPaise), { refundId: refund?.providerRefundId || null, localStatus: refund?.status || null, providerStatus: remote?.status || null });
      const refundEvent = refund?.providerRefundId ? await db.collection('payment_webhook_events').findOne({ 'payload.event': 'refund.processed', 'payload.payload.refund.entity.id': refund.providerRefundId, status: 'completed' }) : null;
      check('Provider refund webhook processed', Boolean(refundEvent), {});
    }
    console.log(JSON.stringify({ orderId, stage: refunded ? 'after-cancellation-and-full-refund' : 'after-successful-payment-before-fulfilment', checks }, null, 2));
    if (checks.some(item => item.result !== 'PASS')) process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Acceptance check failed. Check server/provider access.'); process.exitCode = 1; });
