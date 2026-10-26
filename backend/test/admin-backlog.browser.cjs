// Start Vite on :5173. All API writes use a disposable database on :3102.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { hash } = require('bcryptjs');
const assert = require('node:assert/strict');
(async () => {
  let mongo, server, browser;
  const api = 'http://127.0.0.1:3102', web = 'http://localhost:5173';
  try {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = mongo.getUri('admin_browser');
    await mongoose.connect(uri);
    await mongoose.connection.collection('admins').insertOne({ name: 'Admin', email: 'admin@example.com', role: 'super_admin', isActive: true, authVersion: 0, passwordHash: await hash('browser-password-1234', 10) });
    await mongoose.connection.collection('newsletter_subscribers').insertMany(Array.from({ length: 30 }, (_, i) => ({ email: `subscriber-${i}@example.com`, status: 'subscribed', consentAt: new Date(), confirmedAt: new Date(), createdAt: new Date(Date.now() + i) })));
    await mongoose.connection.collection('product_reviews').insertOne({ customerId: 'fixture', customerName: 'Test Buyer', productSlug: 'almonds', body: 'Fresh almonds and careful packaging.', rating: 5, status: 'pending', createdAt: new Date() });
    server = spawn(process.execPath, ['dist/main.js'], { cwd: join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'test', PORT: '3102', MONGODB_URI: uri, RESEND_API_KEY: '', MAIL_FROM: '', CORS_ORIGINS: web }, stdio: 'ignore' });
    let healthy = false;
    for (let i = 0; i < 100; i++) { if (await fetch(`${api}/health`).then(r => r.ok).catch(() => false)) { healthy = true; break; } await new Promise(resolve => setTimeout(resolve, 100)); }
    assert(healthy, 'API did not start');
    const login = await fetch(`${api}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'browser-password-1234' }) }).then(r => r.json());
    assert(login.accessToken);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://localhost:3000/**', async route => { const response = await route.fetch({ url: route.request().url().replace('http://localhost:3000', api) }); await route.fulfill({ response }); });
    await page.goto(`${web}/admin/login`);
    await page.evaluate(value => sessionStorage.setItem('nutri_admin_session', JSON.stringify(value)), login);
    await page.goto(`${web}/admin/insights`);
    await page.getByRole('heading', { name: 'Sales & engagement', exact: true }).waitFor();
    const subscribers = page.locator('.admin-card').filter({ has: page.getByRole('heading', { name: 'Newsletter subscribers', exact: true }) });
    await subscribers.getByText('1–25 of 30 subscribers').waitFor();
    await subscribers.getByRole('button', { name: 'Next →' }).click();
    await subscribers.getByText('26–30 of 30 subscribers').waitFor();
    await page.getByRole('searchbox', { name: 'Search subscribers' }).fill('subscriber-29@');
    await subscribers.getByText('1–1 of 1 subscribers').waitFor();
    const downloaded = page.waitForEvent('download');
    await subscribers.getByRole('button', { name: 'Export filtered CSV' }).click();
    const download = await downloaded; assert.equal(download.suggestedFilename(), 'subscribers.csv');
    const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString(); assert(csv.includes('subscriber-29@example.com')); assert(!csv.includes('subscriber-28@example.com'));
    const reviews = page.locator('.admin-card').filter({ has: page.getByRole('heading', { name: 'Review moderation', exact: true }) });
    await reviews.getByRole('button', { name: 'Approve', exact: true }).click();
    await reviews.getByRole('cell', { name: 'approved', exact: true }).waitFor();
    await page.getByLabel('From', { exact: true }).fill('2020-01-01');
    await page.getByLabel('To', { exact: true }).fill('2020-01-03');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await page.getByText('2020-01-01 to 2020-01-03', { exact: true }).waitFor();
    await page.getByText('2019-12-29', { exact: false }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admin insights mobile overflow');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Last 30 days', exact: true }).click();
    await page.getByRole('heading', { name: 'Daily paid sales', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    // Exercise shipping settings against the disposable API without provider credentials.
    await page.goto(`${web}/admin/shipping`);
    await page.getByRole('heading', { name: 'Shipping', exact: true }).waitFor();
    await page.getByLabel('Shiprocket pickup location name', { exact: true }).fill('Warehouse');
    for (const [label, value] of [['Weight (kg)', '0.6'], ['Length (cm)', '20'], ['Width (cm)', '15'], ['Height (cm)', '8']]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Save shipping defaults' }).click();
    await page.getByText('Shipping defaults saved.', { exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Shipping', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('input[value="Warehouse"]'));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Shipping settings mobile overflow');
    assert.deepEqual(errors, []);
    console.log('PASS admin browser: mobile and desktop insights, filtered subscriber export, server pagination, review moderation, date filters, previous-period comparison and persistent mobile shipping settings.');
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
    await mongoose.disconnect(); await mongo?.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
