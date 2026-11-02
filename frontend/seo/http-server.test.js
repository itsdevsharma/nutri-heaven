import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { createSeoServer } from './http-server.js';

test('Ubuntu adapter returns route metadata, private noindex, robots and real HTTP statuses', async () => {
  const previousFetch = globalThis.fetch;
  const previousApi = process.env.API_URL;
  process.env.API_URL = 'http://127.0.0.1:3000';
  globalThis.fetch = async url => ({ ok: true, json: async () => url.includes('/products?') ? [] : {} });
  const server = createSeoServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = path => new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${server.address().port}${path}`, response => {
      let body = '';
      response.on('data', part => { body += part; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    }).on('error', reject);
  });
  try {
    const shop = await request('/shop');
    assert.equal(shop.status, 200);
    assert.match(shop.body, /<title>Shop Dry Fruits/);
    const account = await request('/account?reset=secret');
    assert.equal(account.status, 200);
    assert.equal(account.headers['cache-control'], 'no-store');
    assert.match(account.body, /name="robots" content="noindex/);
    assert.ok(!account.body.includes('secret'));
    assert.equal((await request('/not-a-page')).status, 404);
    const redirect = await request('/shop/?category=nuts');
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, '/shop?category=nuts');
    const robots = await request('/robots.txt');
    assert.match(robots.headers['content-type'], /text\/plain/);
    assert.match(robots.body, /Disallow: \/checkout/);
    const sitemap = await request('/sitemap.xml');
    assert.match(sitemap.headers['content-type'], /application\/xml/);
    assert.match(sitemap.body, /<urlset/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = previousFetch;
    if (previousApi === undefined) delete process.env.API_URL; else process.env.API_URL = previousApi;
  }
});
