import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../public/', import.meta.url);
const worker = await readFile(new URL('sw.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
test('install manifest has a stable identity, standalone launch and real correctly sized PNG icons', async () => {
  assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  assert(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const data = await readFile(new URL(icon.src.slice(1), root));
    assert.equal(data.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
});
function harness(fetch = async () => new Response('live')) {
  const handlers = {}, writes = [], removed = [];
  const cache = { addAll: async paths => writes.push(...paths), match: async path => path === '/offline.html' ? new Response('generic offline page') : undefined };
  vm.runInNewContext(worker, { URL, Response, fetch, caches: { open: async () => cache, keys: async () => ['nutri-app-offline-old', 'unrelated-cache'], delete: async key => { removed.push(key); } }, self: { location: { origin: 'https://shop.example.com' }, clients: { claim: async () => {} }, addEventListener: (type, handler) => { handlers[type] = handler; } } });
  return { handlers, writes, removed };
}
test('worker precaches only the public offline page/icon and cleans only its own old caches', async () => {
  const h = harness(); let work;
  h.handlers.install({ waitUntil: promise => { work = promise; } }); await work;
  assert.deepEqual(h.writes, ['/offline.html', '/assets/pwa/icon-192.png']);
  h.handlers.activate({ waitUntil: promise => { work = promise; } }); await work;
  assert.deepEqual(h.removed, ['nutri-app-offline-old']);
});
test('API, cross-origin, payment POSTs and ordinary data fetches bypass the offline worker', () => {
  const h = harness();
  for (const request of [
    { url: 'https://shop.example.com/api/customer/me', method: 'GET', mode: 'navigate' },
    { url: 'https://shop.example.com/api/orders', method: 'POST', mode: 'cors' },
    { url: 'https://api.razorpay.com/payments', method: 'GET', mode: 'navigate' },
    { url: 'https://shop.example.com/customer/me', method: 'GET', mode: 'cors' },
  ]) h.handlers.fetch({ request, respondWith: () => assert.fail('Must use normal network handling') });
  assert.deepEqual(h.writes, []);
});
test('private navigations use fresh network responses and never write them to cache', async () => {
  const h = harness(async () => new Response('private account details')); let response;
  h.handlers.fetch({ request: { url: 'https://shop.example.com/account', method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'private account details'); assert.deepEqual(h.writes, []);
});
test('offline navigations receive only the generic offline screen', async () => {
  const h = harness(async () => { throw new TypeError('Offline'); }); let response;
  h.handlers.fetch({ request: { url: 'https://shop.example.com/admin/orders', method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'generic offline page'); assert.deepEqual(h.writes, []);
});
