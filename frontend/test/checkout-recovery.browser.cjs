// Local UI and intercepted APIs only; no charges, bookings or live data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      let placements = 0, recovered = 0, payments = 0;
      const order = { id: 'NH-RECOVERY', cartId: 'recovery-cart', paymentMethod: 'razorpay', paymentStatus: 'pending', status: 'pending', stockReserved: true, customerName: 'Fixture', customerEmail: 'fixture@example.com', customerPhone: '9876543210', subtotalPaise: 10000, totalPaise: 15000, shippingPaise: 5000, lines: [{ productName: 'Almonds', packSize: '250g', quantity: 1, lineTotalPaise: 10000 }], deliveryAddress: { street: 'Fixture', city: 'Hisar', state: 'Haryana', pin: '125001' } };
      const errors = [];
      await context.route('http://localhost:3000/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-cart-id', 'Access-Control-Allow-Methods': 'GET,POST,DELETE' } });
        let body = {};
        if (path === '/orders') { placements++; body = order; }
        else if (path === '/orders/checkout/missing') return route.fulfill({ status: 404, json: { message: 'Saved checkout is not available yet. Check again shortly.' }, headers: { 'Access-Control-Allow-Origin': '*' } });
        else if (path === '/orders/checkout/attempt-key') { recovered++; assert.equal(req.headers()['x-cart-id'], order.cartId); body = order; }
        else if (path === '/payments/razorpay/orders/NH-RECOVERY') {
          if (req.method() === 'POST') { payments++; body = { keyId: 'rzp_test_fixture', razorpayOrderId: 'remote', amount: order.totalPaise, currency: 'INR' }; }
          else body = order;
        } else if (path.endsWith('/verify')) body = { ...order, paymentStatus: 'paid', status: 'confirmed' };
        else if (path === '/payments/razorpay/config') body = { enabled: true };
        else if (path === '/products' || path === '/categories') body = [];
        else if (path === '/cart') body = { items: [], subtotalPaise: 0, totalPaise: 0 };
        else if (path === '/orders/NH-RECOVERY') body = { ...order, paymentStatus: 'paid', status: 'confirmed' };
        await route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      let page = await context.newPage(); await page.goto(origin);
      // This is the only state left when a tab dies after the backend accepted
      // checkout but before its response supplied an order number.
      await page.evaluate(() => {
        localStorage.setItem('nutri_guest_cart_id', 'recovery-cart');
        localStorage.setItem('nutri_checkout_recovery_v1', JSON.stringify({ expiresAt: Date.now() + 600000, attempt: { cartId: 'recovery-cart', checkoutKey: 'attempt-key', paymentMethod: 'razorpay' } }));
        sessionStorage.setItem('nutri_pending_checkout', JSON.stringify({ payload: { customerEmail: 'private@example.com' } }));
      });
      await page.close(); // New tab has no old sessionStorage or signed callback.
      page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.Razorpay = class { constructor(options) { this.options = options; } on() {} open() { this.options.handler({ razorpay_payment_id: 'fixture', razorpay_order_id: 'remote', razorpay_signature: 'fixture' }); } };
      });
      await page.goto(origin + '/checkout');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('nutri_pending_checkout')), null);
      await page.getByRole('heading', { name: 'Complete your order' }).waitFor();
      await page.getByRole('button', { name: 'Resume checkout', exact: false }).click();
      await page.getByText('Payment received', { exact: true }).waitFor();
      assert.equal(recovered, 1); assert.equal(placements, 0); assert.equal(payments, 1);
      assert.equal(await page.evaluate(() => localStorage.getItem('nutri_checkout_recovery_v1')), null);
      await page.evaluate(() => localStorage.setItem('nutri_checkout_recovery_v1', JSON.stringify({ expiresAt: Date.now() + 600000, attempt: { cartId: 'recovery-cart', checkoutKey: 'missing', paymentMethod: 'razorpay' } })));
      await page.goto(origin + '/checkout');
      await page.getByRole('button', { name: 'Resume checkout', exact: false }).click();
      await page.getByText('Saved checkout is not available yet.', { exact: false }).waitFor();
      assert(await page.evaluate(() => Boolean(localStorage.getItem('nutri_checkout_recovery_v1'))));
      assert.equal(placements, 0, 'An uncertain lookup must not authorize a new checkout');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      console.log(`${width}px passed: closed-tab response recovery, same order payment, no duplicate placement, durable reference cleanup`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
