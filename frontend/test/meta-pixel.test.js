import test from 'node:test';
import assert from 'node:assert/strict';

async function setup() {
  const scripts = [], calls = [], storage = new Map();
  globalThis.window = { location: { pathname: '/shop' }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  globalThis.document = { getElementById: id => scripts.find(script => script.id === id), createElement: () => ({}), head: { appendChild: script => scripts.push(script) } };
  window.fbq = (...args) => calls.push(args);
  const pixel = await import(`../src/meta-pixel.js?test=${Math.random()}`);
  return { pixel, calls, scripts, storage };
}
const settings = { enabled: true, pixelId: '123456789' };
test('initializes once, sends one PageView and stops dispatching when disabled', async () => {
  const { pixel, calls, scripts } = await setup();
  pixel.initializeMetaPixel({ enabled: true, pixelId: 'invalid' });
  assert.equal(scripts.length, 0);
  pixel.initializeMetaPixel(settings);
  pixel.initializeMetaPixel(settings);
  assert.equal(scripts.length, 1);
  assert.deepEqual(calls.map(call => call[0]), ['init', 'trackSingle']);
  pixel.initializeMetaPixel({ ...settings, enabled: false });
  assert.equal(pixel.trackMetaEvent('AddToCart'), false);
  assert.equal(calls.length, 2);
});
test('commerce payload uses rupees, catalogue slugs and contains no customer data', async () => {
  const { pixel } = await setup();
  assert.deepEqual(pixel.commerceData([{ productId: 'almonds', quantity: 2, unitPricePaise: 12550, email: 'private@example.com' }], 25100), {
    content_type: 'product', content_ids: ['almonds'], contents: [{ id: 'almonds', quantity: 2, item_price: 125.5 }], num_items: 2, currency: 'INR', value: 251,
  });
});
test('purchase excludes pending payments and reconciliation, deduplicates confirmed orders across reloads', async () => {
  const { pixel, calls } = await setup();
  pixel.initializeMetaPixel(settings);
  const order = { id: 'NH1', status: 'confirmed', paymentMethod: 'razorpay', paymentStatus: 'pending', totalPaise: 25100, lines: [{ productSlug: 'almonds', quantity: 2, unitPricePaise: 12550 }] };
  assert.equal(pixel.trackPurchase(order), false);
  assert.equal(pixel.trackPurchase({ ...order, paymentStatus: 'paid', paymentReconciliationRequired: true }), false);
  assert.equal(pixel.trackPurchase({ ...order, paymentStatus: 'paid' }), true);
  assert.equal(pixel.trackPurchase({ ...order, paymentStatus: 'paid' }), false);
  const purchase = calls.find(call => call[2] === 'Purchase');
  assert.equal(purchase[3].value, 251);
  assert.deepEqual(purchase[4], { eventID: 'purchase:NH1' });
  const reloaded = await import(`../src/meta-pixel.js?reload=${Math.random()}`);
  reloaded.initializeMetaPixel(settings);
  assert.equal(reloaded.trackPurchase({ ...order, paymentStatus: 'paid' }), false);
  assert.equal(pixel.trackPurchase({ ...order, id: 'COD1', paymentMethod: 'cod' }), true);
});
test('SDK exceptions and blocked storage cannot break storefront actions', async () => {
  const { pixel } = await setup();
  pixel.initializeMetaPixel(settings);
  window.localStorage.getItem = () => { throw new Error('blocked'); };
  window.localStorage.setItem = () => { throw new Error('blocked'); };
  assert.equal(pixel.trackPurchase({ id: 'COD2', status: 'confirmed', paymentMethod: 'cod', totalPaise: 100, lines: [] }), true);
  window.fbq = () => { throw new Error('SDK unavailable'); };
  assert.equal(pixel.trackMetaEvent('AddToCart'), false);
});
