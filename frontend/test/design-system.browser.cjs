// Isolated presentation audit. Fixtures never write to the application's API.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const phase = process.env.AUDIT_PHASE || 'after';
const scope = process.env.AUDIT_SCOPE || 'all';
const out = path.resolve(__dirname, '../../audit-reports/ui-refresh', phase);
const product = { _id: 'audit-product', slug: 'california-almonds', title: 'California Almonds', name: 'California Almonds', category: 'Premium Nuts', status: 'active', image: '/assets/almonds_ze0A.jpg', description: 'Crisp, buttery almonds for everyday snacking.', isActive: true, variants: [{ size: '250g', sku: 'ALM-250', pricePaise: 29900, mrpPaise: 34900, stockQuantity: 24, lowStockThreshold: 5, isActive: true }], updatedAt: '2026-11-20T08:00:00Z' };
const routes = ['/', '/shop', '/account', '/checkout', '/privacy-policy', '/shipping-policy', '/return-policy', '/terms', '/products/california-almonds', '/order-confirmation/NH-AUDIT', '/pending-checkout', '/admin/login', '/admin', '/admin/products', '/admin/products/new', '/admin/products/california-almonds', '/admin/categories', '/admin/inventory', '/admin/orders', '/admin/customers', '/admin/shipping', '/admin/insights', '/admin/reviews', '/admin/offers', '/admin/coupons', '/admin/banners', '/admin/faqs', '/admin/socials', '/admin/users', '/admin/store-content', '/admin/audit', '/admin/missing'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of (process.env.AUDIT_WIDTHS ? process.env.AUDIT_WIDTHS.split(',').map(Number) : scope === 'screenshots' ? [1440, 390] : [1440, 768, 390, 320])) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors = [];
      let archiveRequests = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://localhost:3000/**', async route => {
        const p = new URL(route.request().url()).pathname;
        let body = [];
        if (p.endsWith('/archive')) { archiveRequests++; body = product; }
        else if (p === '/products/browse' || p === '/products/admin') body = { items: [product], total: 1 };
        else if (p.endsWith('/page')) body = { items: p.includes('products') ? [product] : [], total: p.includes('products') ? 1 : 0 };
        else if (p === '/products' || p === '/admin/products') body = [product];
        else if ((p === '/products/california-almonds' || p === '/products/admin/california-almonds')) body = product;
        else if (p.includes('categories')) body = [{ _id: 'nuts', name: 'Premium Nuts', slug: 'premium-nuts', isActive: true }];
        else if (p.startsWith('/reviews/')) body = { count: 0, average: 0, items: [] };
        else if (p.includes('/orders/NH-AUDIT')) body = { customerName: 'Design Review', customerEmail: 'review@example.com', subtotalPaise: 29900, id: 'NH-AUDIT', status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'razorpay', totalPaise: 29900, lines: [], deliveryAddress: { city: 'Hisar', state: 'Haryana' } };
        else if (p.includes('/cart')) body = { items: [], subtotalPaise: 0, totalPaise: 0 };
        else if (p.includes('/engagement/report')) body = { revenuePaise: 0, paidOrders: 0, orders: 0, customers: 0, daily: [], topProducts: [], catalogueIssues: [], previous: {}, emailConfigured: false };
        else if (/settings|content|config|summary/.test(p)) body = {};
        await route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      });
      for (const route of routes.filter(route => scope === 'interactions' ? route === '/admin/products' : scope === 'screenshots' ? ['/', '/shop', '/account', '/admin', '/admin/products', '/admin/login', '/admin/insights'].includes(route) : true)) {
        errors.length = 0;
        await page.goto((process.env.FRONTEND_URL || 'http://127.0.0.1:5173') + route, { waitUntil: 'domcontentloaded' });
        if (route.startsWith('/admin') && route !== '/admin/login') {
          await page.evaluate(() => sessionStorage.setItem('nutri_admin_session', JSON.stringify({ accessToken: 'fixture.' + btoa(JSON.stringify({ exp: Date.now()/1000 + 3600 })) + '.fixture', admin: { name: 'Design review', email: 'review@example.com', role: 'super_admin' } })));
          await page.goto((process.env.FRONTEND_URL || 'http://127.0.0.1:5173') + route, { waitUntil: 'domcontentloaded' });
        } else if (route === '/admin/login') {
          await page.evaluate(() => sessionStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
        }
        await page.locator('main').first().waitFor({ state: 'visible' });
        await page.waitForTimeout(500);
        const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, content: document.querySelector('main')?.innerText.length || 0 }));
        results.push({ route, width, ...state, errors: [...errors] });
        if (scope !== 'routes' && ['/', '/shop', '/account', '/admin', '/admin/products', '/admin/login', '/admin/insights'].includes(route) && [1440, 390].includes(width)) {
          await page.locator('img').evaluateAll(images => Promise.all(images.map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); })));
          await page.screenshot({ path: path.join(out, `${route.replaceAll('/', '_') || 'home'}-${width}.png`), fullPage: true });
        }
      }
      if (phase === 'after' && !['screenshots', 'routes'].includes(scope)) {
        await page.goto('http://127.0.0.1:5173/admin/products', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);
        if (width > 960) {
          await page.getByRole('button', { name: 'Collapse navigation' }).click();
          await page.getByRole('button', { name: 'Expand navigation' }).waitFor();
          assert.equal(await page.locator('.admin-shell-collapsed').count(), 1);
          await page.getByRole('button', { name: 'Expand navigation' }).click();
        } else {
          await page.getByRole('button', { name: 'Open navigation' }).click();
          await page.locator('.admin-sidebar-open').waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.admin-sidebar-open').count(), 0);
        }
      }
      if (phase === 'after' && !['screenshots', 'routes'].includes(scope)) {
        const guide = page.getByRole('button', { name: 'How to use', exact: true });
        await guide.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        await dialog.getByRole('button', { name: 'Got it' }).focus();
        await page.keyboard.press('Tab');
        assert.equal(await dialog.getByRole('button', { name: 'Close dialog' }).evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await guide.evaluate(el => el === document.activeElement), true);
        const archiveBefore = archiveRequests;
        await page.getByRole('button', { name: 'Archive', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
        assert.equal(archiveRequests, archiveBefore, 'Cancelling archive must not mutate the catalogue');
        await page.getByRole('button', { name: 'Archive', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
        await page.getByText('“California Almonds” was archived.', { exact: true }).waitFor();
        assert.equal(archiveRequests, archiveBefore + 1, 'Confirmation archives once');
        await page.goto('http://127.0.0.1:5173/shop', { waitUntil: 'domcontentloaded' });
        await page.locator('.bag').click();
        await page.getByRole('dialog', { name: 'Shopping bag' }).waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').count(), 0);
        assert.equal(await page.locator('.bag').evaluate(el => el === document.activeElement), true);
        await page.locator('.product-image-button').first().click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').count(), 0);
        const contrast = await page.evaluate(() => {
          const luminance = color => {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
          };
          const a = luminance(getComputedStyle(document.querySelector('.bag')).color);
          const b = luminance(getComputedStyle(document.querySelector('.nav')).backgroundColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        assert(contrast >= 4.5, `Header text contrast: ${contrast}`);
        await page.evaluate(() => sessionStorage.clear());
        await page.goto('http://127.0.0.1:5173/admin/login', { waitUntil: 'domcontentloaded' });
        await page.getByLabel(/^Work email/).fill('review@example.com');
        await page.getByLabel(/^Password/).fill('sample-password');
      }
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, process.env.AUDIT_WIDTHS ? `routes-${process.env.AUDIT_WIDTHS}-results.json` : ['all', 'routes'].includes(scope) ? 'results.json' : `${scope}-results.json`), JSON.stringify(results, null, 2));
  const failures = results.filter(r => r.overflow || r.errors.length || !r.content);
  console.log(`${results.length} route/viewport checks; ${failures.length} findings`);
  console.log(JSON.stringify(failures, null, 2));
  if (phase === 'after') assert.equal(failures.length, 0, 'Presentation audit has findings');
})().catch(error => { console.error(error); process.exitCode = 1; });
