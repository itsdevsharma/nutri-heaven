// Run Vite on :5173 first. All API calls are mocked; no live orders are changed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => sessionStorage.setItem('nutri_admin_session', JSON.stringify({ accessToken: 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture', admin: { email: 'admin@example.com', name: 'Admin', role: 'super_admin' } })));
      const order = { id: 'NH-AMOUNT', customerName: 'Test Buyer', customerEmail: 'buyer@example.com', customerPhone: '9000000000', createdAt: new Date().toISOString(), status: 'confirmed', paymentStatus: 'pending', paymentMethod: 'cod', stockReserved: true, totalPaise: 25000, subtotalPaise: 20000, shippingPaise: 5000, deliveryAddress: { street: '12 Market Road', city: 'Hisar', state: 'Haryana', pin: '125001' }, operations: { fulfillment: 'unaccepted', shipment: 'not_created', returnStatus: 'not_requested' }, allowedActions: ['accept'], amountOverrideBlockedReason: null, lines: [{ productSlug: 'nuts', productName: 'Nuts', packSize: '250g', quantity: 1, lineTotalPaise: 20000 }], activity: [] };
      let saves = 0, fail = true;
      await page.route('http://localhost:3000/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let body = [], status = 200;
        if (path === '/orders/admin') body = [order];
        else if (path === '/admin/shipping/configuration') body = { configured: false };
        else if (path.endsWith('/amount')) {
          const payload = route.request().postDataJSON(); saves++;
          assert.equal(payload.totalPaise, 22550); assert.equal(payload.expectedTotalPaise, 25000);
          assert.equal(payload.reason, 'Customer discount'); assert(payload.idempotencyKey);
          if (fail) { status = 409; body = { message: 'Order changed. Please retry.' }; fail = false; }
          else {
            order.activity.push({ action: 'override_amount', actor: 'admin@example.com', reason: payload.reason, at: new Date().toISOString(), before: { totalPaise: order.totalPaise }, after: { totalPaise: payload.totalPaise } });
            order.totalPaise = payload.totalPaise; order.amountAdjustmentPaise = -2450; body = order;
          }
        }
        await route.fulfill({ status, json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await page.goto((process.env.FRONTEND_URL || 'http://127.0.0.1:5173') + '/admin/orders');
      await page.getByRole('button', { name: 'View order →' }).click();
      const dialog = page.getByRole('dialog', { name: 'Order NH-AMOUNT' });
      await dialog.getByRole('button', { name: 'Override amount', exact: true }).click();
      await dialog.getByLabel('New order total (₹)').fill('225.50');
      await dialog.getByLabel('Reason for amount change').fill('Customer discount');
      await page.screenshot({ path: `/tmp/nutri-amount-form-${width}.png`, fullPage: true });
      await dialog.getByRole('button', { name: 'Save amount override' }).click();
      await page.getByText('Order changed. Please retry.', { exact: true }).waitFor();
      assert.equal(await dialog.getByLabel('New order total (₹)').inputValue(), '225.50');
      await dialog.getByRole('button', { name: 'Save amount override' }).click();
      await page.getByText('Order amount updated.', { exact: true }).waitFor();
      assert.equal(saves, 2);
      await dialog.getByText('Admin adjustment', { exact: true }).waitFor();
      await dialog.getByText('Amount change history (1)', { exact: true }).click();
      await dialog.getByText('admin@example.com · Customer discount', { exact: true }).first().waitFor();
      await page.screenshot({ path: `/tmp/nutri-amount-saved-${width}.png`, fullPage: true });
      assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), 'Dialog overflow');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflow');
      assert.deepEqual(errors, []);
      console.log(`${width}px passed: edit, API error, retry, refreshed amount, adjustment and audit history`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
