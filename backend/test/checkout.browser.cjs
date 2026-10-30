// Run Vite on :5173 first. Provider/API calls are fixtures; no live payment or booking.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await mkdir('/tmp/nutri-checkout-preview', { recursive: true });
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const product = { slug: 'nuts', title: 'Almonds', description: 'Fresh almonds.', category: 'Nuts', image: 'almonds_ze0A.jpg', pricePaise: 10000, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 20, isActive: true }] };
      const cart = { items: [{ productId: 'nuts', productName: 'Almonds', packSize: '250g', quantity: 1, image: product.image, unitPricePaise: 10000 }], subtotalPaise: 10000, shippingPaise: 7900, totalPaise: 17900 };
      let submitted;
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/assets/') && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '3000') {
          let body = {};
          if (url.pathname.startsWith('/products/browse')) body = { items: [product], total: 1, limit: 24, offset: 0 };
          else if (url.pathname === '/products/nuts') body = product;
          else if (url.pathname === '/products' || url.pathname === '/categories') body = [product];
          else if (url.pathname.startsWith('/cart')) body = cart;
          else if (url.pathname === '/payments/razorpay/config') body = { enabled: true, testMode: true };
          else if (url.pathname === '/checkout/configuration') body = { enabled: true };
          else if (url.pathname === '/checkout/quotes') body = { id: '00000000-0000-4000-8000-000000000001', subtotalPaise: 10000, discountPaise: 0, taxPaise: 0, expiresAt: new Date(Date.now() + 600000).toISOString(), options: [{ courierId: 7, name: 'Standard surface delivery', shippingPaise: 6525, estimatedDays: '3–5' }, { courierId: 9, name: 'Express air delivery', shippingPaise: 9500, estimatedDays: '1–2' }] };
          else if (url.pathname === '/orders') { submitted = route.request().postDataJSON(); body = { ...submitted, id: 'NH-PREVIEW', subtotalPaise: 10000, shippingPaise: 6525, totalPaise: 16525, status: 'confirmed', paymentStatus: 'pending', lines: [{ productName: 'Almonds', packSize: '250g', quantity: 1, unitPricePaise: 10000, lineTotalPaise: 10000 }] }; }
          else if (url.pathname.startsWith('/reviews')) body = { items: [], count: 0, average: 0 };
          return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
        }
        if (url.hostname.includes('google') || url.hostname.includes('facebook')) return route.abort();
        return route.continue();
      });
      await page.goto('http://127.0.0.1:5173/products/nuts');
      await page.getByRole('button', { name: 'Buy now', exact: true }).click();
      await page.getByLabel('Email', { exact: true }).fill('buyer@example.com');
      await page.getByLabel('Full name', { exact: true }).fill('Test Buyer');
      await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
      await page.getByLabel('Street address', { exact: true }).fill('12 Main Street');
      await page.getByLabel('City', { exact: true }).fill('Delhi');
      await page.getByLabel('State', { exact: true }).fill('Delhi');
      await page.getByLabel('PIN code', { exact: true }).fill('110001');
      await page.getByRole('button', { name: 'Calculate / refresh delivery' }).click();
      await page.getByText('Standard surface delivery', { exact: false }).waitFor();
      assert.match(await page.locator('.summary-total').innerText(), /165\.25/);
      await page.getByLabel('Express air delivery', { exact: false }).check();
      assert.match(await page.locator('.summary-total').innerText(), /195/);
      await page.getByLabel('City', { exact: true }).fill('New Delhi');
      assert.equal(await page.locator('.delivery-option').count(), 0, 'Address change must invalidate delivery');
      await page.getByRole('button', { name: 'Calculate / refresh delivery' }).click();
      await page.locator('.delivery-option').first().waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
      await page.screenshot({ path: `/tmp/nutri-checkout-preview/${width}.png`, fullPage: true });
      await page.getByRole('checkbox', { name: 'I agree' }).check();
      await page.getByRole('button', { name: 'Place COD order', exact: false }).click();
      await page.waitForFunction(() => document.body.textContent.includes('NH-PREVIEW'));
      assert.equal(submitted.shippingQuoteId, '00000000-0000-4000-8000-000000000001'); assert.equal(submitted.courierId, 7);
      assert.deepEqual(errors, [], `Browser errors at ${width}px`);
      console.log(`Checkout passed: ${width}px, delivery selection, invalidation, confirmed order, no overflow or page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
