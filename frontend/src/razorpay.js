const STORAGE_KEY = 'nutri_pending_checkout';
const RECOVERY_KEY = 'nutri_checkout_recovery_v1';
const RECOVERY_TTL = 24 * 60 * 60 * 1000;
let checkoutScript;
export function readPendingCheckout() {
  try {
    const session = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (session) return session;
  } catch { /* A durable reference may still be recoverable. */ }
  try {
    const saved = JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null');
    if (!saved || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) { localStorage.removeItem(RECOVERY_KEY); return null; }
    return saved.attempt;
  } catch { return null; }
}
export function savePendingCheckout(value) {
  // Keep full details in this tab only. Durable recovery contains opaque IDs,
  // never address/contact fields or a signed provider payment response.
  if (value) {
    const attempt = Object.fromEntries(['orderId', 'cartId', 'paymentMethod', 'source', 'checkoutKey'].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
    if (value.payload?.idempotencyKey) attempt.checkoutKey = value.payload.idempotencyKey;
    try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ expiresAt: Date.now() + RECOVERY_TTL, attempt })); } catch { /* Session recovery remains available. */ }
  } else {
    try { localStorage.removeItem(RECOVERY_KEY); } catch { /* Storage may be disabled. */ }
  }
  if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  else sessionStorage.removeItem(STORAGE_KEY);
}
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let timeout;
    const failed = () => { clearTimeout(timeout); script.remove(); checkoutScript = undefined; reject(new Error('Could not load online payments. Check your connection and try again.')); };
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onerror = failed;
    script.onload = () => { clearTimeout(timeout); if (window.Razorpay) resolve(window.Razorpay); else failed(); };
    timeout = setTimeout(failed, 15000);
    document.head.appendChild(script);
  });
  return checkoutScript;
}
export async function openRazorpay(payment, order, onFailure = () => {}) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    let completed = false;
    const checkout = new Razorpay({
      key: payment.keyId,
      order_id: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      name: 'Nutri Heaven',
      description: `Order #${order.id}`,
      image: `${window.location.origin}/assets/nutri-heaven-logo.jpeg`,
      prefill: { name: order.customerName, email: order.customerEmail, contact: order.customerPhone },
      theme: { color: '#153f2f' },
      handler: result => { completed = true; resolve(result); },
      modal: { ondismiss: () => { if (!completed) reject(new Error('Payment window closed. Your order is unpaid; retry payment or cancel this order.')); } },
    });
    checkout.on('payment.failed', () => onFailure('Payment attempt failed. You can retry in the payment window or close it to return here.'));
    checkout.open();
  });
}
