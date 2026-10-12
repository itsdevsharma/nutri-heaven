const STORAGE_KEY = 'nutri_pending_checkout';
let checkoutScript;
export function readPendingCheckout() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
export function savePendingCheckout(value) {
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
