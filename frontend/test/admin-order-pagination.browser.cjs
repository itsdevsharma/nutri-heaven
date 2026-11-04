// All API calls intercepted. Server pages contain only the requested slice.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = [], requests = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => sessionStorage.setItem('nutri_admin_session', JSON.stringify({ accessToken: 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture', admin: { email: 'fixture@example.com', name: 'Fixture', role: 'super_admin' } })));
      const orders = Array.from({ length: 45 }, (_, index) => ({ id: 'NH-PAGE-' + String(index).padStart(2, '0'), customerName: index === 37 ? 'Unique Buyer' : 'Buyer ' + index, customerEmail: 'fixture@example.com', customerPhone: '9876543210', createdAt: '2026-11-04T05:00:00Z', status: index < 30 ? 'confirmed' : 'delivered', paymentStatus: 'pending', paymentMethod: 'cod', stockReserved: true, subtotalPaise: 10000, shippingPaise: 0, totalPaise: 10000, deliveryAddress: { street: 'Fixture', city: 'Hisar', state: 'Haryana', pin: '125001' }, operations: { fulfillment: index < 30 ? 'unaccepted' : 'completed', shipment: index < 30 ? 'not_created' : 'delivered', returnStatus: 'not_requested' }, allowedActions: [], activity: [], lines: [] }));
      let failNext = false;
      await page.route('http://localhost:3000/**', async route => {
        const url = new URL(route.request().url()), path = url.pathname;
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,x-cart-id', 'Access-Control-Allow-Methods': 'GET,POST,PATCH' } });
        let body = [];
        if (path === '/orders/admin/page') {
          requests.push(Object.fromEntries(url.searchParams));
          if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { message: 'Fixture page unavailable' }, headers: { 'Access-Control-Allow-Origin': '*' } }); }
          const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
          const q = url.searchParams.get('q')?.toLowerCase(), status = url.searchParams.get('status');
          let matching = orders.filter(order => (!q || order.customerName.toLowerCase().includes(q)) && (!status || order.status === status));
          if (url.searchParams.get('queue') === 'inbox') matching = matching.filter(order => order.status === 'confirmed');
          body = { items: matching.slice(offset, offset + limit), total: matching.length, limit, offset, summary: { totalOrders: 45, toFulfil: 30, inTransit: 0, delivered: 15 } };
        } else if (path.startsWith('/orders/admin/NH-PAGE-')) body = orders.find(order => order.id === path.split('/').at(-1));
        else if (path === '/admin/shipping/configuration') body = { configured: false };
        else if (path.startsWith('/admin/shipping/orders/')) body = null;
        await route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await page.goto((process.env.FRONTEND_URL || 'http://127.0.0.1:5173') + '/admin/orders');
      await page.getByText('1–20 of 45 orders', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'View order →', exact: true }).count(), 20);
      await page.getByRole('button', { name: 'Next →', exact: true }).click();
      await page.getByText('21–40 of 45 orders', { exact: true }).waitFor();
      assert(requests.some(request => request.offset === '20' && request.limit === '20'));
      await page.getByRole('button', { name: 'View order →', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Order NH-PAGE-20' }); await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('searchbox', { name: 'Search orders' }).fill('Unique Buyer');
      await page.getByText('1–1 of 1 orders', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'View order →', exact: true }).count(), 1);
      assert(requests.some(request => request.q === 'Unique Buyer' && request.offset === '0'));
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await page.getByText('1–20 of 45 orders', { exact: true }).waitFor();
      await page.getByRole('combobox', { name: 'Fulfilment', exact: true }).selectOption('delivered');
      await page.getByText('1–15 of 15 orders', { exact: true }).waitFor();
      failNext = true;
      await page.getByRole('button', { name: /Refresh orders/ }).click();
      await page.getByText('Fixture page unavailable', { exact: true }).waitFor();
      await page.getByRole('button', { name: /Try again|Retry/ }).click();
      await page.getByText('1–15 of 15 orders', { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.locator('.admin-table tbody tr').first().evaluate(row => row.getBoundingClientRect().height < 150), 'Order rows must remain readable instead of wrapping IDs into tall columns');
      assert.deepEqual(errors, []);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `/tmp/nutri-order-pagination-${width}.png`, fullPage: true });
      console.log(`${width}px passed: bounded server pages, search across pages, status filter, independent details, error retry, no overflow`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
