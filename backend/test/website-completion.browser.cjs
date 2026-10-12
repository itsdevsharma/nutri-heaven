// Run after backend build with Vite on :5173. Uses only a disposable database.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const { hash } = require('bcryptjs');
(async () => {
  let mongo, server, browser;
  const api = 'http://127.0.0.1:3101', web = 'http://localhost:5173';
  try {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = mongo.getUri('browser_audit');
    await mongoose.connect(uri);
    await mongoose.connection.collection('products').insertMany(Array.from({ length: 55 }, (_, i) => ({ slug: `browser-nuts-${i}`, title: `Browser Nuts ${i}`, description: 'Fresh crunchy nuts for a balanced pantry.', image: 'almonds_ze0A.jpg', category: 'Nuts', pricePaise: 25000 + i, isActive: true, status: 'active', variants: [{ size: '250g', pricePaise: 25000 + i, stockQuantity: 20, isActive: true }] })));
    await mongoose.connection.collection('admins').insertOne({ name: 'Browser Admin', email: 'browser-admin@example.com', role: 'super_admin', isActive: true, authVersion: 0, passwordHash: await hash('browser-password-1234', 10) });
    server = spawn(process.execPath, ['dist/main.js'], { cwd: join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'test', PORT: '3101', MONGODB_URI: uri, RESEND_API_KEY: '', MAIL_FROM: '', CORS_ORIGINS: web }, stdio: 'ignore' });
    let healthy = false;
    for (let i = 0; i < 100; i++) { if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { healthy = true; break; } await new Promise(resolve => setTimeout(resolve, 100)); }
    assert(healthy, 'API did not start');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://localhost:3000/**', async route => { const response = await route.fetch({ url: route.request().url().replace('http://localhost:3000', api) }); await route.fulfill({ response }); });
    await page.goto(`${web}/account`);
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.locator('input[name=name]').fill('Browser Customer'); await page.locator('input[name=email]').fill('browser@example.com'); await page.locator('input[name=password]').fill('browser-password-1234');
    await page.locator('.account-submit').click(); await page.getByRole('heading', { name: 'Profile', exact: true }).waitFor();
    await page.getByText('Your account is ready!', { exact: false }).waitFor();
    await page.getByLabel('Full name', { exact: true }).fill('Browser Updated'); await page.getByLabel('Phone', { exact: true }).fill('9876543210'); await page.getByRole('button', { name: 'Save profile' }).click(); await page.getByText('Profile saved.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add address', exact: true }).click();
    for (const [label, value] of Object.entries({ 'Recipient name': 'Browser Customer', 'Street address': '12 Main Street', City: 'Hisar', State: 'Haryana', 'PIN code': '125001' })) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Save address' }).click(); await page.getByText('Address saved.', { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Account overflow');
    await page.goto(`${web}/shop`); await page.locator('.shop-product').first().waitFor(); assert.equal(await page.locator('.shop-product').count(), 24);
    await page.getByRole('button', { name: 'Next →', exact: true }).click(); await page.getByText('Page 2 of 3').waitFor();
    await page.getByRole('searchbox', { name: 'Search products' }).fill('Browser Nuts 54'); await page.getByText('1 product', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save to wishlist', exact: true }).click(); await page.getByRole('button', { name: 'Remove from wishlist', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add +', exact: true }).click();
    await page.getByRole('button', { name: 'Proceed to checkout →', exact: true }).click();
    await page.locator('input[name=acceptedTerms]').check();
    await page.getByRole('button', { name: 'Place COD order →', exact: true }).click();
    await page.getByText('ORDER CONFIRMED', { exact: true }).waitFor();
    const placed = await mongoose.connection.collection('orders').findOne({ customerEmail: 'browser@example.com' });
    assert(placed?.customerId, 'Signed-in checkout must bind the order to the customer ID');
    assert.equal(placed.status, 'confirmed');
    assert.equal((await mongoose.connection.collection('products').findOne({ slug: 'browser-nuts-54' })).variants[0].stockQuantity, 19);
    await page.goto(`${web}/account`); await page.getByText(placed.id, { exact: false }).first().waitFor(); await page.locator('.customer-wishlist').getByText('Browser Nuts 54').waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByRole('button', { name: 'Forgot password?', exact: true }).click(); await page.locator('input[name=email]').fill('browser@example.com'); await page.getByRole('button', { name: 'Send reset link' }).click();
    const notice = page.locator('.account-notification'); await notice.filter({ hasText: 'Development link:' }).waitFor();
    const link = (await notice.innerText()).match(/http:\/\/localhost:5173\/account\?reset=[a-f0-9]+/)[0];
    await page.goto(link); await page.getByLabel('Password', { exact: true }).fill('replacement-password-1234'); await page.getByLabel('Confirm password', { exact: true }).fill('replacement-password-1234'); await page.getByRole('button', { name: 'Update password' }).click(); await page.getByText('Password updated. You’re signed in!', { exact: true }).waitFor();
    const joined = await fetch(`${api}/newsletter/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'newsletter-browser@example.com', consent: true }) }).then(r => r.json());
    await page.goto(`${web}/account?newsletter=confirm&token=${joined.confirmationToken}`); await page.getByRole('button', { name: 'Confirm subscription' }).click(); await page.getByText('Your subscription is confirmed.', { exact: true }).waitFor();
    const login = await fetch(`${api}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'browser-admin@example.com', password: 'browser-password-1234' }) }).then(r => r.json());
    await page.evaluate(value => sessionStorage.setItem('nutri_admin_session', JSON.stringify(value)), login);
    await page.goto(`${web}/admin/insights`); await page.getByRole('heading', { name: 'Sales & engagement' }).waitFor(); await page.getByText('newsletter-browser@example.com').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS browser: signup, profile, address, pagination, global search, wishlist, real COD checkout with stock reservation and customer ownership, reset password, newsletter confirmation, admin report; mobile account has no overflow.');
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
    await mongoose.disconnect(); await mongo?.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
