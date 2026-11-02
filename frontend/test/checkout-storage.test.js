import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_CHECKOUT, readCheckoutDraft, saveCheckoutDraft, clearCheckoutDraft } from '../src/checkout-storage.js';
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
test('checkout refresh restores details, but never consent, quote IDs or another cart', () => {
  const session = storage();
  saveCheckoutDraft('cart-a', { ...EMPTY_CHECKOUT, name: 'Shopper', address: '123 Test Road', acceptedTerms: true, shippingQuoteId: 'expired-quote', paymentMethod: 'razorpay' }, session);
  const restored = readCheckoutDraft('cart-a', session);
  assert.equal(restored.name, 'Shopper');
  assert.equal(restored.address, '123 Test Road');
  assert.equal(restored.acceptedTerms, false);
  assert.equal(restored.shippingQuoteId, undefined);
  assert.equal(restored.paymentMethod, 'razorpay');
  assert.deepEqual(readCheckoutDraft('cart-b', session), EMPTY_CHECKOUT);
  saveCheckoutDraft('cart-b', { ...EMPTY_CHECKOUT, name: 'Shopper' }, session);
  clearCheckoutDraft(session);
  assert.deepEqual(readCheckoutDraft('cart-b', session), EMPTY_CHECKOUT);
});
test('corrupt, expired and unavailable storage do not prevent checkout', () => {
  const session = storage();
  session.setItem('nutri_checkout_draft_v1', '{');
  assert.deepEqual(readCheckoutDraft('cart', session), EMPTY_CHECKOUT);
  session.setItem('nutri_checkout_draft_v1', JSON.stringify({ cart: 'cart', savedAt: 1, form: { name: 'Old' } }));
  assert.deepEqual(readCheckoutDraft('cart', session), EMPTY_CHECKOUT);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.deepEqual(readCheckoutDraft('cart', blocked), EMPTY_CHECKOUT);
  assert.doesNotThrow(() => saveCheckoutDraft('cart', EMPTY_CHECKOUT, blocked));
  assert.doesNotThrow(() => clearCheckoutDraft(blocked));
});
