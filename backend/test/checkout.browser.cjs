// Run Vite on :5173 first. Provider/API calls are fixtures; no live payment or booking.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const storeMode = process.env.STORE_DELIVERY_FIXTURE === 'true';
const courierId = storeMode ? 1 : 7;
const shippingPaise = storeMode ? 15000 : 6525;
const totalPaise = 10000 + shippingPaise;
const totalText = (totalPaise / 100).toLocaleString('en-IN');
const deliveryName = storeMode ? 'Interstate delivery' : 'Standard surface delivery';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await mkdir('/tmp/nutri-checkout-preview', { recursive: true });
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const product = { slug: 'nuts', title: 'Almonds', description: 'Fresh almonds.', category: 'Nuts', image: 'almonds_ze0A.jpg', pricePaise: 10000, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 20, isActive: true }] };
      const cart = { items: [{ productId: 'nuts', productName: 'Almonds', packSize: '250g', quantity: 1, image: product.image, unitPricePaise: 10000 }], subtotalPaise: 10000, shippingPending: true, shippingPaise: null, totalPaise: null };
      let submitted, savedOrder, quoteRequests = [];
      let failNextQuote = false;
      await page.addInitScript(() => {
        window.Razorpay = class {
          constructor(options) { window.checkoutOptions = options; this.options = options; }
          on() {}
          open() { this.options.handler({ razorpay_payment_id: 'pay_preview', razorpay_order_id: this.options.order_id, razorpay_signature: 'fixture' }); }
        };
      });
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/assets/') && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '3000') {
          let body = {};
          if (url.pathname.startsWith('/products/browse')) body = { items: [product], total: 1, limit: 24, offset: 0 };
          else if (url.pathname === '/products/nuts') body = product;
          else if (url.pathname === '/products') body = [product];
          else if (url.pathname === '/categories') body = [{ _id: 'nuts', name: 'Nuts', slug: 'nuts', isActive: true }];
          else if (url.pathname.startsWith('/cart')) body = cart;
          else if (url.pathname === '/payments/razorpay/config') body = { enabled: true, testMode: true };
          else if (url.pathname === '/checkout/configuration') body = { enabled: true, mode: storeMode ? 'store' : 'shiprocket' };
          else if (url.pathname === '/checkout/quotes') {
            quoteRequests.push(route.request().postDataJSON());
            if (failNextQuote) {
              failNextQuote = false;
              return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Could not calculate delivery rates. Please retry.' }) });
            }
            body = { id: '00000000-0000-4000-8000-000000000001', subtotalPaise: 10000, discountPaise: 0, taxPaise: 0, expiresAt: new Date(Date.now() + 600000).toISOString(), options: storeMode ? [{ courierId, name: deliveryName, shippingPaise, estimatedDays: '' }] : [{ courierId, name: deliveryName, shippingPaise, estimatedDays: '3–5' }, { courierId: 9, name: 'Express air delivery', shippingPaise: 9500, estimatedDays: '1–2' }], ...(storeMode ? { source: 'store', storeRate: { zone: 'interstate', weightGrams: 250, slabGrams: 1000, slabs: 1, ratePaise: shippingPaise } } : { parcel: { weight: 0.28 } }) }; }
          else if (url.pathname === '/orders') { submitted = route.request().postDataJSON(); body = savedOrder = { ...submitted, id: 'NH-PREVIEW', subtotalPaise: 10000, shippingPaise, totalPaise, status: submitted.paymentMethod === 'cod' ? 'confirmed' : 'pending', paymentStatus: 'pending', lines: [{ productName: 'Almonds', packSize: '250g', quantity: 1, unitPricePaise: 10000, lineTotalPaise: 10000 }] }; }
          else if (url.pathname === '/payments/razorpay/orders/NH-PREVIEW/verify') body = { ...savedOrder, status: 'confirmed', paymentStatus: 'paid' };
          else if (url.pathname === '/payments/razorpay/orders/NH-PREVIEW') body = route.request().method() === 'POST' ? { keyId: 'rzp_test_fixture', razorpayOrderId: 'order_preview', amount: savedOrder.totalPaise, currency: 'INR' } : savedOrder;
          else if (url.pathname.startsWith('/reviews')) body = { items: [], count: 0, average: 0 };
          return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
        }
        if (url.hostname.includes('google') || url.hostname.includes('facebook')) return route.abort();
        return route.continue();
      });
      await page.goto('http://127.0.0.1:5173/products/nuts');
      await page.getByRole('button', { name: 'Buy now', exact: true }).click();
      await page.waitForURL('**/checkout');
      assert.equal(new URL(page.url()).pathname, '/checkout');
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Almost there.' }).waitFor();
      await page.getByText('Almonds (250g) × 1', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/checkout', 'Refresh must stay on checkout');
      await page.goBack({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Buy now', exact: true }).waitFor();
      await page.goForward({ waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Almost there.' }).waitFor();
      await page.getByRole('button', { name: 'Return to bag', exact: false }).click();
      await page.getByRole('complementary', { name: 'Shopping bag' }).waitFor();
      await page.getByRole('button', { name: 'Proceed to checkout', exact: false }).click();
      assert.equal(new URL(page.url()).pathname, '/checkout');
      await page.getByLabel('Email', { exact: true }).fill('buyer@example.com');
      await page.getByLabel('Full name', { exact: true }).fill('Test Buyer');
      await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
      await page.getByLabel('Street address', { exact: true }).fill('12 Main Street');
      await page.getByLabel('City', { exact: true }).fill('Delhi');
      await page.getByLabel('State', { exact: true }).fill('Delhi');
      await page.getByLabel('PIN code', { exact: true }).fill('110001');
      await page.getByText(deliveryName, { exact: false }).waitFor();
      assert((await page.locator('.summary-total').innerText()).includes(totalText));
      if (storeMode) await page.getByText('Shipping weight: 250 g', { exact: false }).waitFor();
      if (!storeMode) {
        await page.getByLabel('Express air delivery', { exact: false }).check();
        assert.match(await page.locator('.summary-total').innerText(), /195/);
      }
      await page.getByLabel('City', { exact: true }).fill('New Delhi');
      assert.equal(await page.locator('.delivery-option').count(), 0, 'Address change must invalidate delivery');
      await page.locator('.delivery-option').first().waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
      await page.screenshot({ path: `/tmp/nutri-checkout-preview/${storeMode ? 'store-' : ''}${width}.png`, fullPage: true });
      // Payment type changes require new rates (COD fees may differ).
      await page.getByLabel('Pay online with Razorpay', { exact: false }).check();
      assert.equal(await page.locator('.delivery-option').count(), 0);
      await page.locator('.delivery-option').first().waitFor();
      assert.equal(quoteRequests.at(-1).paymentMethod, 'razorpay');
      // Missing rates must block payment; the customer can retry the quote.
      failNextQuote = true;
      await page.getByLabel('PIN code', { exact: true }).fill('110002');
      await page.getByText('Could not calculate delivery rates. Please retry.', { exact: true }).waitFor();
      assert(await page.locator('button[type="submit"]').isDisabled());
      await page.getByRole('button', { name: 'Refresh delivery', exact: true }).click();
      await page.locator('.delivery-option').first().waitFor();
      await page.getByLabel(deliveryName, { exact: false }).check();
      assert((await page.locator('button[type="submit"]').innerText()).includes(totalText));
      await page.getByRole('checkbox', { name: 'I agree' }).check();
      await page.getByRole('button', { name: `Pay ₹${totalText}`, exact: false }).click();
      await page.getByText('Payment received', { exact: true }).waitFor();
      assert.equal(submitted.shippingQuoteId, '00000000-0000-4000-8000-000000000001'); assert.equal(submitted.courierId, courierId);
      assert.equal(await page.evaluate(() => window.checkoutOptions.amount), totalPaise);
      assert.deepEqual(errors, [], `Browser errors at ${width}px`);
      console.log(`Checkout passed: ${storeMode ? 'store' : 'shiprocket'} ${width}px, checkout refresh/back/forward/return-to-bag, automatic delivery, courier selection, address/payment invalidation, error retry, matching Razorpay amount, no overflow or page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
