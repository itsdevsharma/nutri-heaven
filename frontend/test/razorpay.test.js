import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRazorpay, openRazorpay, readPendingCheckout, savePendingCheckout } from '../src/razorpay.js';

test('stores and clears pending checkout for refresh recovery', () => {
  const values = new Map();
  globalThis.sessionStorage = { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  const pending = { orderId: 'NH1', cartId: 'cart', paymentResponse: { razorpay_payment_id: 'pay_1' } };
  savePendingCheckout(pending);
  assert.deepEqual(readPendingCheckout(),pending);
  savePendingCheckout(null);
  assert.equal(readPendingCheckout(),null);
  values.set('nutri_pending_checkout','bad-json');
  assert.equal(readPendingCheckout(),null);
});
test('recovers an opaque checkout reference after tab loss without retaining personal or payment data', () => {
  const session = new Map(), local = new Map();
  const storage = values => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) });
  globalThis.sessionStorage = storage(session); globalThis.localStorage = storage(local);
  savePendingCheckout({ cartId: 'cart', paymentMethod: 'razorpay', payload: { idempotencyKey: 'attempt-key', customerName: 'Private Person', customerEmail: 'private@example.com', deliveryAddress: { street: 'Private Street' } }, paymentResponse: { razorpay_signature: 'private-signature' } });
  const durable = local.get('nutri_checkout_recovery_v1');
  for (const secret of ['Private Person', 'private@example.com', 'Private Street', 'private-signature']) assert(!durable.includes(secret));
  session.clear();
  assert.deepEqual(readPendingCheckout(), { cartId: 'cart', paymentMethod: 'razorpay', checkoutKey: 'attempt-key' });
  savePendingCheckout({ cartId: 'cart', orderId: 'NH1', paymentMethod: 'razorpay' }); session.clear();
  assert.equal(readPendingCheckout().orderId, 'NH1');
  const expired = JSON.parse(local.get('nutri_checkout_recovery_v1')); expired.expiresAt = Date.now() - 1;
  local.set('nutri_checkout_recovery_v1', JSON.stringify(expired)); assert.equal(readPendingCheckout(), null);
  savePendingCheckout({ cartId: 'cart', orderId: 'NH1' }); savePendingCheckout(null);
  assert.equal(local.size, 0); assert.equal(session.size, 0);
});
test('loads a single checkout script and forwards trusted backend options', async () => {
  const scripts=[];
  let options;
  let eventHandlers;
  class Checkout {
    constructor(value) { options=value;eventHandlers={}; }
    on(event,handler) {eventHandlers[event]=handler;}
    open() { options.handler({razorpay_payment_id:'pay_1',razorpay_order_id:'order_1',razorpay_signature:'signature'}); }
  }
  globalThis.window={location:{origin:'https://shop.example.com'}};
  globalThis.document={createElement:()=>({remove(){}}),head:{appendChild:script=>{scripts.push(script);queueMicrotask(()=>{window.Razorpay=Checkout;script.onload();});}}};
  await Promise.all([loadRazorpay(),loadRazorpay()]);
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].src,'https://checkout.razorpay.com/v1/checkout.js');
  const receipt=await openRazorpay({keyId:'rzp_test_1',razorpayOrderId:'order_1',amount:35400,currency:'INR'},{id:'NH1',customerName:'Customer',customerEmail:'customer@example.com',customerPhone:'9876543210'});
  assert.equal(options.amount,35400);
  assert.equal(options.order_id,'order_1');
  assert.equal(options.prefill.email,'customer@example.com');
  assert.equal(receipt.razorpay_payment_id,'pay_1');
  assert.equal(typeof eventHandlers['payment.failed'],'function');
});
test('dismissal rejects the checkout while failed attempts can retry in the popup', async () => {
  let message;
  globalThis.window.Razorpay=class {
    constructor(value){this.options=value;}
    on(event,handler){this.failed=handler;}
    open(){this.failed({});this.options.modal.ondismiss();}
  };
  await assert.rejects(openRazorpay({},{id:'NH1'},text=>{message=text;}),/Payment window closed/);
  assert.match(message,/retry in the payment window/);
});
