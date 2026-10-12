import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import template from './generated-template.js';
import assert from 'node:assert/strict';
import { pageSeo, seoHead, sitemapXml, robotsTxt, renderContent, PUBLIC_PAGES } from './site.js';
import render from '../api/render.js';
import sitemap from '../api/sitemap.js';
import robots from '../api/robots.js';
const origin = 'https://shop.example.com';
const product = { slug: 'almonds', title: 'Premium Almonds', description: 'Fresh & crunchy almonds', image: 'almonds.jpg', seoTitle: 'Buy Almonds', seoDescription: 'Our selected almonds.', updatedAt: '2026-10-12T00:00:00Z', variants: [{ size: '250g', pricePaise: 25000, stockQuantity: 5, isActive: true, sku: 'ALM-250' }] };
function response() {
  return { headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; return this; } };
}
test('canonical URLs, product SEO fields, real prices and availability', () => {
  const seo = pageSeo({ path: '/products/almonds', origin, product });
  assert.equal(seo.canonical, `${origin}/products/almonds`);
  assert.equal(seo.title, 'Buy Almonds');
  assert.equal(seo.description, product.seoDescription);
  const schema = seo.structuredData['@graph'].find(item => item['@type'] === 'Product');
  assert.equal(schema.offers.price, '250.00');
  assert.equal(schema.offers.availability, 'https://schema.org/InStock');
  assert.equal(schema.offers.priceCurrency, 'INR');
  const outOfStock = pageSeo({ path: '/products/almonds', origin, product: { ...product, variants: [{ ...product.variants[0], stockQuantity: 0 }] } });
  assert.equal(outOfStock.structuredData['@graph'].find(item => item['@type'] === 'Product').offers.availability, 'https://schema.org/OutOfStock');
});
test('public pages are indexable; private and unknown pages are excluded', () => {
  for (const path of Object.keys(PUBLIC_PAGES)) assert.equal(pageSeo({ path, origin }).noindex, false);
  for (const path of ['/admin', '/account', '/missing', '/products/missing']) assert.equal(pageSeo({ path, origin }).noindex, true);
});
test('metadata and JSON-LD safely escape stored content', () => {
  const hostile = '</script><script>alert("x")</script>';
  const head = seoHead(pageSeo({ origin, settings: { seo: { title: hostile, description: hostile } } }));
  assert.ok(!head.includes(hostile));
  const withProduct = seoHead(pageSeo({ path: '/products/almonds', origin, product: { ...product, title: hostile } }));
  assert.ok(withProduct.includes('\\u003c/script>'));
  assert.ok(!renderContent({ path: '/', products: [{ ...product, title: hostile }] }).includes(hostile));
});
test('sitemap contains canonical public URLs and valid product timestamps', () => {
  const xml = sitemapXml(origin, [product, product, { ...product, slug: 'nuts&seeds', updatedAt: 'invalid' }]);
  assert.equal((xml.match(/<loc>https:\/\/shop.example.com\/products\/almonds<\/loc>/g) || []).length, 1);
  assert.ok(xml.includes('/products/nuts%26seeds'));
  assert.ok(xml.includes('<lastmod>2026-10-12T00:00:00.000Z</lastmod>'));
  assert.ok(!xml.includes('/account'));
  assert.ok(!xml.includes('/admin'));
  assert.ok(robotsTxt(origin).includes(`Sitemap: ${origin}/sitemap.xml`));
});
test('production handlers serve page HTML, sitemap, robots, 404s and retryable API failures', async () => {
  const originalFetch = globalThis.fetch;
  const oldApi = process.env.VITE_API_URL;
  const oldSite = process.env.SITE_URL;
  process.env.VITE_API_URL = 'https://api.example.com';
  process.env.SITE_URL = origin;
  const settings = { seo: { title: 'Nutri pantry', googleSiteVerification: 'token123' }, content: { privacyPolicy: 'Your information stays protected.' } };
  try {
    globalThis.fetch = async url => {
      if (url.endsWith('/storefront/settings')) return { ok: true, json: async () => settings };
      if (url.endsWith('/products/almonds')) return { ok: true, json: async () => product };
      if (url.endsWith('/products/missing')) return { ok: false, status: 404 };
      if (url.includes('/products?')) {
        const offset = new URL(url).searchParams.get('offset');
        return { ok: true, json: async () => offset === '0' ? Array.from({ length: 100 }, (_, i) => ({ ...product, slug: `item-${i}` })) : [product] };
      }
      throw new Error('Unexpected URL: ' + url);
    };
    const page = response();
    await render({ query: { path: 'products/almonds' } }, page);
    assert.equal(page.statusCode, 200);
    assert.ok(page.body.includes('<title>Buy Almonds</title>'));
    assert.ok(page.body.includes(`href="${origin}/products/almonds"`));
    assert.ok(page.body.includes('name="google-site-verification" content="token123"'));
    assert.ok(page.body.includes('<h1>Premium Almonds</h1>'));
    assert.ok(!page.body.includes('<!-- SEO_START -->'));
    assert.ok(page.body.includes('type="module"'));
    const policy = response();
    await render({ query: { path: 'privacy-policy' } }, policy);
    assert.ok(policy.body.includes(settings.content.privacyPolicy));
    for (const path of ['missing-route', 'products/missing']) {
      const missing = response();
      await render({ query: { path } }, missing);
      assert.equal(missing.statusCode, 404);
      assert.ok(missing.body.includes('noindex, follow'));
    }
    const account = response();
    await render({ query: { path: 'account' } }, account);
    assert.equal(account.headers['X-Robots-Tag'], 'noindex, follow');
    const map = response();
    await sitemap({}, map);
    assert.equal(map.statusCode, 200);
    assert.equal((map.body.match(/<url>/g) || []).length, 107);
    assert.ok(map.headers['Content-Type'].startsWith('application/xml'));
    const robot = response();
    robots({}, robot);
    assert.equal(robot.body, robotsTxt(origin));
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const failure = response();
    await render({ query: { path: 'products/almonds' } }, failure);
    assert.equal(failure.statusCode, 503);
    const mapFailure = response();
    await sitemap({}, mapFailure);
    assert.equal(mapFailure.statusCode, 503);
    assert.equal(mapFailure.headers['Cache-Control'], 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
    if (oldApi === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = oldApi;
    if (oldSite === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = oldSite;
  }
});

test('Vercel routes render the homepage before static files and retain asset serving', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const filesystem = config.routes.findIndex(route => route.handle === 'filesystem');
  const root = config.routes.findIndex(route => route.src === '^/$');
  assert.ok(root >= 0 && root < filesystem);
  assert.equal(config.routes[root].dest, '/api/render?path=');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  assert.ok(config.routes.findIndex(route => route.dest === '/assets/nutri-heaven-logo.jpeg') < filesystem);
  assert.ok(config.routes.findIndex(route => route.src === '^/(.*)$') > filesystem);
});


test('renderer works without a runtime dist directory and retains built asset URLs', async () => {
  const built = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.equal(template, built);
  const cwd = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), 'nutri-render-'));
  try {
    process.chdir(directory);
    const result = response();
    await render({ query: { path: 'account' } }, result);
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /src="\/assets\/index-[^"]+\.js"/);
    assert.match(result.body, /href="\/assets\/index-[^"]+\.css"/);
    const missing = response();
    await render({ query: { path: 'not-a-page' } }, missing);
    assert.equal(missing.statusCode, 404);
  } finally {
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  }
});
