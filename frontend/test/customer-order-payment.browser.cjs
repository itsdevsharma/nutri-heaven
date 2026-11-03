// Run Vite on :5173 first. Customer data and all payments are mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';
const apiOrigin = process.env.API_ORIGIN || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('nutri_customer_access_token', 'customer-fixture');
        localStorage.setItem('nutri_guest_cart_id', 'new-device-cart');
        window.paymentOpens = 0;
        window.Razorpay = class {
          constructor(options) { this.options = options; }
          on() {}
          open() {
            window.paymentOpens++;
            if (!sessionStorage.getItem('fixture-dismissed')) { sessionStorage.setItem('fixture-dismissed', 'yes'); this.options.modal.ondismiss(); }
            else this.options.handler({ razorpay_payment_id: 'pay_customer', razorpay_order_id: this.options.order_id, razorpay_signature: 'fixture' });
          }
        };
      });
      const order = { id: 'NH-UNPAID', cartId: 'original-device-cart', customerId: 'customer-1', customerName: 'Test Buyer', customerEmail: 'buyer@example.com', customerPhone: '9876543210', paymentMethod: 'razorpay', paymentStatus: 'pending', status: 'pending', stockReserved: true, subtotalPaise: 20000, shippingPaise: 5000, totalPaise: 25000, lines: [{ productSlug: 'nuts', productName: 'Almonds', packSize: '250g', quantity: 2, lineTotalPaise: 20000 }], deliveryAddress: { street: '12 Main', city: 'Delhi', state: 'Delhi', pin: '110001' }, statusHistory: [] };
      const orders = [order, { ...order, id: 'NH-COD', paymentMethod: 'cod', status: 'confirmed' }, { ...order, id: 'NH-CANCELLED', status: 'cancelled', stockReserved: false }, { ...order, id: 'NH-PAID', status: 'confirmed', paymentStatus: 'paid' }];
      let newOrders = 0, cartClears = 0, starts = 0;
      await page.route(apiOrigin + '/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/api/, '');
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,x-cart-id', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,PATCH' } });
        let body = {};
        if (path === '/customer/me') body = { id: 'customer-1', name: 'Test Buyer', email: 'buyer@example.com', phone: '', addresses: [] };
        else if (path === '/customer/me/orders') body = orders;
        else if (path === '/customer/me/orders/NH-UNPAID') body = order;
        else if (path === '/customer/me/wishlist' || path === '/customer/me/notifications' || path === '/products' || path === '/categories') body = [];
        else if (path.startsWith('/cart')) { if (req.method() === 'DELETE') cartClears++; body = { items: [{ productId: 'new-item', productName: 'New item', packSize: '250g', quantity: 1, unitPricePaise: 10000 }], subtotalPaise: 10000 }; }
        else if (path === '/orders') { newOrders++; body = order; }
        else if (path === '/payments/razorpay/config') body = { enabled: true };
        else if (path === '/customer/me/orders/NH-UNPAID/payment') {
          assert.equal(req.headers().authorization, 'Bearer customer-fixture');
          if (req.method() === 'POST') { starts++; body = { keyId: 'rzp_test_fixture', razorpayOrderId: 'order_customer', amount: order.totalPaise, currency: 'INR' }; }
          else body = order;
        }
        else if (path.endsWith('/payment/verify')) { order.paymentStatus = 'paid'; order.status = 'confirmed'; body = order; }
        await route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await page.goto(origin + '/account#account-orders');
      const section = page.locator('#account-orders');
      await section.getByRole('button', { name: 'Complete payment · ₹250', exact: true }).waitFor();
      assert.equal(await section.getByRole('button', { name: /Complete payment/ }).count(), 1);
      await section.locator('summary').filter({ hasText: 'NH-COD' }).first().click();
      await section.getByText('Cash on delivery: pay ₹250 when your order arrives.', { exact: true }).waitFor();
      await section.locator('summary').filter({ hasText: 'NH-CANCELLED' }).first().click();
      await section.getByText('This order was cancelled.', { exact: false }).waitFor();
      await page.screenshot({ path: `/tmp/nutri-customer-orders-${width}.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await section.getByRole('button', { name: 'Complete payment · ₹250', exact: true }).click();
      await page.getByText('Payment window closed.', { exact: false }).waitFor();
      assert.equal(starts, 1); assert.equal(newOrders, 0);
      await page.reload();
      await page.getByRole('button', { name: 'Resume checkout', exact: false }).click();
      await page.getByText('Payment received', { exact: true }).waitFor();
      assert.equal(newOrders, 0); assert.equal(cartClears, 0); assert.equal(starts, 2);
      assert.equal(new URL(page.url()).searchParams.get('source'), 'account');
      await page.reload();
      await page.getByText('Payment received', { exact: true }).waitFor();
      await page.getByRole('link', { name: 'Manage this order', exact: false }).click();
      await page.locator('#account-orders').waitFor();
      assert.equal(await page.getByRole('button', { name: /Complete payment/ }).count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${width}px passed: unpaid online payment, COD/cancelled explanation, account authentication, dismissal and refresh recovery, no duplicate orders, existing bag preserved, refreshed confirmation`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
