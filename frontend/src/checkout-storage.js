const KEY = 'nutri_checkout_draft_v1';
const FIELDS = ['name', 'email', 'phone', 'address', 'landmark', 'city', 'state', 'pin', 'couponCode', 'paymentMethod'];
const TTL = 24 * 60 * 60 * 1000;
export const EMPTY_CHECKOUT = { name: '', email: '', phone: '', address: '', landmark: '', city: '', state: '', pin: '', couponCode: '', acceptedTerms: false, paymentMethod: 'cod' };

// Session storage survives refresh without retaining a customer's address on
// a shared browser after the tab is closed. Quotes and consent are never saved.
export function readCheckoutDraft(cart, storage) {
  try {
    storage ??= globalThis.sessionStorage;
    const saved = JSON.parse(storage.getItem(KEY));
    if (!saved || saved.cart !== cart || !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > TTL) {
      storage.removeItem(KEY);
      return { ...EMPTY_CHECKOUT };
    }
    const values = Object.fromEntries(FIELDS.filter(key => typeof saved.form?.[key] === 'string').map(key => [key, saved.form[key].slice(0, 1000)]));
    values.paymentMethod = values.paymentMethod === 'razorpay' ? 'razorpay' : 'cod';
    return { ...EMPTY_CHECKOUT, ...values };
  } catch { return { ...EMPTY_CHECKOUT }; }
}
export function saveCheckoutDraft(cart, form, storage) {
  try { (storage ?? globalThis.sessionStorage).setItem(KEY, JSON.stringify({ cart, savedAt: Date.now(), form: Object.fromEntries(FIELDS.map(key => [key, form[key]])) })); } catch { /* Checkout still works when storage is unavailable. */ }
}
export function clearCheckoutDraft(storage) {
  try { (storage ?? globalThis.sessionStorage).removeItem(KEY); } catch { /* Storage is optional. */ }
}
