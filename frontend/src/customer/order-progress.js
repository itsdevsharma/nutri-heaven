export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format((value ?? 0) / 100);
export const dateTime = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
export const payable = order => order.paymentMethod === 'razorpay' && order.status === 'pending' && ['pending', 'failed'].includes(order.paymentStatus) && order.stockReserved && !order.paymentReconciliationRequired;
export const receiptAvailable = order => ['paid', 'refunded'].includes(order.paymentStatus) && !order.paymentReconciliationRequired;
export function trackingLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const stages = ['Order placed', 'Preparing', 'Packed', 'On the way', 'Delivered'];
export function orderProgress(order) {
  const op = order.operations ?? {};
  let step = ({ accepted: 1, picking: 1, packed: 2, ready_to_dispatch: 2, dispatched: 3, completed: 4 })[op.fulfillment] ?? 0;
  step = Math.max(step, ({ packed: 2, shipped: 3, out_for_delivery: 3, delivered: 4, return_requested: 4, returned: 4 })[order.status] ?? 0);
  const courier = String(order.deliveryTracking?.status ?? '').trim().toUpperCase();
  if (courier === 'DELIVERED') step = 4;
  else if (['IN TRANSIT', 'OUT FOR DELIVERY', 'PICKED UP', 'SHIPPED'].includes(courier)) step = Math.max(step, 3);
  const exception = ({ cancelled: ['Order cancelled', 'This order will not be delivered.'], return_requested: ['Return requested', 'Our team will review your return request.'], returned: ['Return received', 'Your returned items have been received.'], refunded: ['Payment refunded', 'Your refund has been processed.'] })[order.status];
  let title = stages[step], description = '';
  if (step === 0) { title = payable(order) ? 'Waiting for payment' : 'Waiting for acceptance'; description = payable(order) ? 'Complete payment so our team can prepare your order.' : 'Your order is placed. Our team will review it before preparation begins.'; }
  if (step === 1) description = 'Our team is preparing your items.';
  if (step === 2) description = op.fulfillment === 'ready_to_dispatch' ? 'Your parcel is ready and waiting for dispatch.' : 'Your items are packed. We’ll update this page when they leave.';
  if (step === 3) { title = order.status === 'out_for_delivery' || op.shipment === 'out_for_delivery' || courier === 'OUT FOR DELIVERY' ? 'Out for delivery' : 'On the way'; description = title === 'Out for delivery' ? 'Your parcel is on its final journey to your address.' : 'Your parcel has been dispatched. Follow its latest delivery updates below.'; }
  if (step === 4) description = 'Your parcel has been marked as delivered.';
  if (order.paymentReconciliationRequired) { title = 'Payment under review'; description = 'Contact support with your order number before paying again. We’ll update your order after the payment review.'; }
  else if (exception) [title, description] = exception;
  const dates = stages.map((_, i) => {
    if (i === 0) return order.createdAt;
    const actions = [[], ['accept', 'pick'], ['pack', 'ready'], ['dispatch', 'out_for_delivery'], ['deliver']][i];
    const activity = order.activity?.find(event => actions.includes(event.action));
    const statuses = [[], [], ['packed'], ['shipped', 'out_for_delivery'], ['delivered']][i];
    return activity?.at ?? order.statusHistory?.find(event => statuses.includes(event.status))?.at;
  });
  return { step, title, description, exceptional: Boolean(exception || order.paymentReconciliationRequired), stages: stages.map((title, index) => ({ title, date: dates[index] })) };
}
export function paymentMessage(order) {
  if (order.paymentReconciliationRequired) return 'Payment needs review. Contact support before paying again.';
  if (order.paymentStatus === 'refunded') return 'Your payment has been refunded.';
  if (order.status === 'cancelled' && order.paymentStatus === 'paid') return 'Payment received for this cancelled order. Contact support to follow up on your refund.';
  if (order.paymentStatus === 'paid') return 'Payment received. No further payment is due.';
  if (order.status === 'cancelled') return 'No payment is due for this cancelled order.';
  if (order.paymentMethod === 'cod') return `Cash on delivery: pay ${money(order.totalPaise)} when your order arrives.`;
  if (payable(order)) return `Complete your online payment of ${money(order.totalPaise)} to confirm this order.`;
  return 'Contact support if you have already paid for this order.';
}
