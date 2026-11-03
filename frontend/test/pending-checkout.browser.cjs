// Run Vite on :5173 first. All order and payment calls are mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('nutri_guest_cart_id', 'cart-retry');
        if (!sessionStorage.getItem('fixture-initialized')) {
          sessionStorage.setItem('fixture-initialized', 'true');
          sessionStorage.setItem('nutri_pending_checkout', JSON.stringify({ cartId: 'cart-retry', orderId: 'NH-RETRY', paymentMethod: 'razorpay' }));
        }
        window.paymentOpens = 0;
        window.Razorpay = class {
          constructor(options) { this.options = options; }
          on() {}
          open() {
            window.paymentOpens++;
            if (window.paymentOpens === 1) this.options.modal.ondismiss();
            else this.options.handler({ razorpay_payment_id: 'pay_retry', razorpay_order_id: this.options.order_id, razorpay_signature: 'fixture' });
          }
        };
      });
      const product = { slug: 'nuts', title: 'Almonds', description: 'Fresh almonds', category: 'Nuts', image: 'almonds_ze0A.jpg', pricePaise: 10000, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 20, isActive: true }] };
      const cart = { items: [{ productId: 'nuts', productName: 'Almonds', packSize: '250g', quantity: 1, image: product.image, unitPricePaise: 10000 }], subtotalPaise: 10000, shippingPending: true };
      const order = { id: 'NH-RETRY', cartId: 'cart-retry', customerName: 'Test Buyer', customerEmail: 'buyer@example.com', customerPhone: '9876543210', paymentMethod: 'razorpay', paymentStatus: 'pending', status: 'pending', stockReserved: true, subtotalPaise: 10000, shippingPaise: 5000, totalPaise: 15000, lines: [{ productName: 'Almonds', packSize: '250g', quantity: 1, lineTotalPaise: 10000 }], deliveryAddress: { street: '12 Main', city: 'Delhi', state: 'Delhi', pin: '110001' } };
      let newOrders = 0, paymentStarts = 0, checks = 0;
      await page.route('http://localhost:3000/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        let body = {};
        if (path === '/products') body = [product];
        else if (path.startsWith('/products/browse')) body = { items: [product], total: 1, limit: 24, offset: 0 };
        else if (path === '/categories') body = [{ _id: 'nuts', name: 'Nuts', isActive: true }];
        else if (path.startsWith('/cart')) body = cart;
        else if (path === '/orders') { newOrders++; body = order; }
        else if (path === '/payments/razorpay/config') body = { enabled: true };
        else if (path === '/payments/razorpay/orders/NH-RETRY') {
          if (req.method() === 'POST') { paymentStarts++; body = { keyId: 'rzp_test_fixture', razorpayOrderId: 'order_retry', amount: order.totalPaise, currency: 'INR' }; }
          else { checks++; body = order; }
        }
        else if (path.endsWith('/verify')) body = { ...order, paymentStatus: 'paid', status: 'confirmed' };
        else if (path.startsWith('/reviews')) body = { items: [], count: 0, average: 0 };
        await route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await page.goto('http://127.0.0.1:5173/checkout');
      await page.getByRole('heading', { name: 'Complete your order' }).waitFor();
      await page.getByRole('link', { name: 'Nutri Heaven home', exact: true }).first().click();
      await page.waitForURL('http://127.0.0.1:5173/');
      await page.locator('#store-navigation').waitFor({ state: 'attached' });
      assert.equal(await page.getByRole('heading', { name: 'Complete your order' }).count(), 0);
      assert(await page.evaluate(() => Boolean(sessionStorage.getItem('nutri_pending_checkout'))));
      await page.goto('http://127.0.0.1:5173/checkout');
      await page.getByRole('button', { name: 'Return to bag', exact: false }).click();
      await page.getByRole('complementary', { name: 'Shopping bag' }).waitFor();
      await page.getByRole('button', { name: 'Proceed to checkout', exact: false }).click();
      await page.getByRole('heading', { name: 'Complete your order' }).waitFor();
      await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
      await page.getByText('Payment is not confirmed yet.', { exact: false }).waitFor();
      assert.equal(paymentStarts, 0);
      await page.getByRole('button', { name: 'Resume checkout', exact: false }).click();
      await page.getByText('Payment window closed.', { exact: false }).waitFor();
      assert.equal(paymentStarts, 1);
      await page.screenshot({ path: `/tmp/nutri-checkout-retry-${width}.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('button', { name: 'Resume checkout', exact: false }).click();
      await page.getByText('Payment received', { exact: true }).waitFor();
      assert.equal(paymentStarts, 2); assert(checks >= 3); assert.equal(newOrders, 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('nutri_pending_checkout')), null);
      assert.deepEqual(errors, []);
      console.log(`${width}px passed: logo returns home, saved order retained, return to bag, check status, dismiss and resume same payment`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
