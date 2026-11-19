// Disposable API fixtures; no production customer or sales records are accessed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => sessionStorage.setItem('nutri_admin_session', JSON.stringify({ accessToken: 'fixture.' + btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600 })) + '.fixture', admin: { email: 'fixture@example.com', name: 'Fixture', role: 'super_admin' } })));
      const daily = Array.from({ length: 30 }, (_, index) => ({ _id: new Date(Date.UTC(2026, 9, 21 + index)).toISOString().slice(0, 10), orders: index === 14 ? 1 : 0, revenuePaise: index === 14 ? 100 : 0 }));
      let fail = false;
      await page.route('http://localhost:3000/**', async route => {
        const url = new URL(route.request().url());
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,x-cart-id', 'Access-Control-Allow-Methods': 'GET,POST,PATCH' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        let body = [];
        if (url.pathname === '/admin/engagement/report') {
          requests.push(Object.fromEntries(url.searchParams));
          if (fail) { fail = false; return route.fulfill({ status: 503, headers, json: { message: 'Report temporarily unavailable' } }); }
          body = { from: url.searchParams.get('from') || '2026-10-21', to: url.searchParams.get('to') || '2026-11-19', previous: { from: '2026-09-21', to: '2026-10-20', revenuePaise: 0, paidOrders: 0 }, revenuePaise: 100, paidOrders: 1, orders: 12, customers: 2, daily, topProducts: [{ _id: 'premium-almonds-250g', units: 1, grossPaise: 100 }], catalogueIssues: [], pendingEmails: 0, emailConfigured: true };
        } else if (url.pathname.endsWith('/page')) body = { items: [], total: 0 };
        await route.fulfill({ headers, json: body });
      });
      await page.goto((process.env.FRONTEND_URL || 'http://127.0.0.1:5173') + '/admin/insights');
      await page.getByText('1–7 of 30 days', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('From', { exact: true }).inputValue(), '2026-10-21');
      assert.equal(await page.locator('.engagement-sales tbody tr').count(), 7);
      assert.match(await page.locator('.engagement-sales tbody tr').first().innerText(), /19 Nov 2026/);
      await page.getByRole('button', { name: 'Next →', exact: true }).click();
      await page.getByText('8–14 of 30 days', { exact: true }).waitFor();
      await page.getByLabel('Days with sales only').check();
      await page.getByText('1–1 of 1 days', { exact: true }).waitFor();
      assert.equal(await page.locator('.engagement-sales tbody tr').count(), 1);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export daily sales', exact: true }).click();
      const download = await downloadPromise;
      const fs = require('node:fs');
      const csv = fs.readFileSync(await download.path(), 'utf8');
      assert(csv.includes('2026-10-21') && csv.includes('2026-11-19'), 'Export retains all days despite the filter');
      await page.getByLabel('From', { exact: true }).fill('2025-01-01');
      await page.getByRole('button', { name: 'Apply dates', exact: true }).click();
      assert.match(await page.getByLabel('To', { exact: true }).evaluate(input => input.validationMessage), /366/);
      await page.getByLabel('From', { exact: true }).fill('2026-11-01');
      await page.getByRole('button', { name: 'Apply dates', exact: true }).click();
      await page.getByText('1–1 of 1 days', { exact: true }).waitFor();
      assert(requests.some(request => request.from === '2026-11-01' && request.to === '2026-11-19'));
      await page.getByRole('button', { name: 'Last 30 days', exact: true }).click();
      await page.getByText('1–1 of 1 days', { exact: true }).waitFor();
      await page.getByLabel('Days with sales only').uncheck();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `/tmp/nutri-engagement-${width}.png`, fullPage: true });
      fail = true;
      await page.getByRole('button', { name: 'Apply dates', exact: true }).click();
      await page.getByText('Report temporarily unavailable', { exact: true }).waitFor();
      await page.getByRole('button', { name: /Try again|Retry/ }).click();
      await page.getByText('1–7 of 30 days', { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`${width}px: pagination, sales filter, full CSV export, date validation, date reset, error retry and overflow checks passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
