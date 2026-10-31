import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const helper = readFileSync(new URL('../src/random-id.js', import.meta.url), 'utf8').replace('export function', 'function');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const httpCrypto = { getRandomValues: bytes => webcrypto.getRandomValues(bytes) };

test('HTTP contexts generate unique UUIDs without randomUUID', () => {
  const context = vm.createContext({ crypto: httpCrypto });
  vm.runInContext(helper, context);
  const ids = new Set(Array.from({ length: 100 }, () => vm.runInContext('randomId()', context)));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, uuidPattern);
});

test('secure contexts retain native UUID generation', () => {
  const context = vm.createContext({ crypto: { randomUUID: () => 'native-id' } });
  assert.equal(vm.runInContext(`${helper}\nrandomId()`, context), 'native-id');
});

test('a first-time HTTP visitor can fetch the catalogue and reuse the cart ID', async () => {
  const storage = new Map();
  const requests = [];
  const context = vm.createContext({
    crypto: httpCrypto,
    URLSearchParams,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    storeCache: { get: (_key, _ttl, load) => load() },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ items: [{ slug: 'almonds' }], total: 1 }) };
    },
  });
  const api = readFileSync(new URL('../src/cart-api.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replaceAll('import.meta.env.VITE_API_URL', "''")
    .replace(/export /g, '');
  vm.runInContext(`${helper}\n${api}`, context);
  const result = await vm.runInContext('storefrontApi.browse({ limit: 24 })', context);
  assert.equal(result.items[0].slug, 'almonds');
  assert.equal(requests[0].url, '/products/browse?limit=24');
  const id = requests[0].options.headers['x-cart-id'];
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(storage.get('nutri_guest_cart_id'), id);
  await vm.runInContext('storefrontApi.browse({ limit: 24 })', context);
  assert.equal(requests[1].options.headers['x-cart-id'], id);
});
