// Run the production preview on :4173 first. Admin API calls and install prompts are mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: [] }));
      await page.goto('http://127.0.0.1:4173/admin');
      await page.waitForURL('**/admin/login');
      const button = page.getByRole('button', { name: 'Install admin app', exact: true });
      await button.click();
      const dialog = page.getByRole('dialog', { name: 'Install Nutri Heaven Admin' });
      await dialog.waitFor();
      await page.screenshot({ path: `/tmp/nutri-admin-install-login-${width}.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByRole('button', { name: 'Got it', exact: true }).click();
      assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/assets/pwa/admin.webmanifest');
      const cdp = await page.context().newCDPSession(page);
      const manifest = await cdp.send('Page.getAppManifest');
      assert(manifest.url.endsWith('/assets/pwa/admin.webmanifest')); assert.deepEqual(manifest.errors, []);
      const data = JSON.parse(manifest.data);
      assert.equal(data.start_url, '/admin'); assert.equal(data.id, '/admin');
      await page.evaluate(() => sessionStorage.setItem('nutri_admin_session', JSON.stringify({ accessToken: 'fixture.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture', admin: { name: 'Staff', email: 'staff@example.com', role: 'super_admin' } })));
      await page.goto('http://127.0.0.1:4173/admin/orders');
      const toolbarButton = page.locator('.admin-topbar').getByRole('button', { name: 'Install admin app', exact: true });
      await toolbarButton.click();
      await page.getByRole('dialog', { name: 'Install Nutri Heaven Admin' }).waitFor();
      await page.getByRole('button', { name: 'Got it', exact: true }).click();
      await page.screenshot({ path: `/tmp/nutri-admin-install-toolbar-${width}.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(() => {
        window.installPromptCalls = 0;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.installPromptCalls++; };
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(event);
      });
      await toolbarButton.click();
      assert.equal(await page.evaluate(() => window.installPromptCalls), 1);
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      await toolbarButton.waitFor({ state: 'detached' });
      assert.deepEqual(errors, []);
      console.log(`${width}px passed: login and toolbar install controls, admin manifest, instructions, native prompt handler, installed state, no overflow`);
      await page.close();
    }
    const ios = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
    await ios.goto('http://127.0.0.1:4173/admin/login');
    await ios.getByRole('button', { name: 'Install admin app' }).click();
    await ios.getByText('Add to Home Screen', { exact: true }).waitFor();
    console.log('iPhone instructions passed');
    await ios.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
