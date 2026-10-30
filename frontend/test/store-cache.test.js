import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoreCache } from '../src/store-cache.js';

function harness(maxEntries = 80) {
  let time = 1000;
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const options = { storage: () => storage, now: () => time, maxEntries };
  return { cache: createStoreCache(options), restore: () => createStoreCache(options), advance: ms => { time += ms; } };
}

test('reuses public data across reloads, expires it, and isolates callers from mutation', async () => {
  const h = harness(); let calls = 0;
  const load = async () => ({ stock: ++calls });
  const first = await h.cache.get('products', 100, load); first.stock = 999;
  assert.deepEqual(await h.cache.get('products', 100, load), { stock: 1 });
  assert.deepEqual(await h.restore().get('products', 100, load), { stock: 1 });
  h.advance(100);
  assert.deepEqual(await h.cache.get('products', 100, load), { stock: 2 });
});

test('combines concurrent requests and retries failures without caching errors', async () => {
  const { cache } = harness(); let calls = 0;
  const load = async () => { calls++; return ['almonds']; };
  assert.deepEqual(await Promise.all([cache.get('p', 100, load), cache.get('p', 100, load)]), [['almonds'], ['almonds']]);
  assert.equal(calls, 1);
  await assert.rejects(cache.get('error', 100, async () => { throw new Error('offline'); }));
  assert.equal(await cache.get('error', 100, async () => 'recovered'), 'recovered');
});

test('an in-flight read cannot restore stale data after a mutation clears the cache', async () => {
  const h = harness(); let resolve;
  const oldRead = h.cache.get('p', 100, () => new Promise(done => { resolve = done; }));
  await Promise.resolve(); h.cache.clear(); resolve('old'); await oldRead;
  assert.equal(await h.cache.get('p', 100, async () => 'new'), 'new');
  assert.equal(await h.restore().get('p', 100, async () => 'unexpected'), 'new');
});

test('bounds storage and keeps working when browser storage is blocked', async () => {
  const h = harness(2);
  for (const key of ['a', 'b', 'c']) await h.cache.get(key, 100, async () => key);
  assert.equal(await h.restore().get('a', 100, async () => 'evicted'), 'evicted');
  const blocked = createStoreCache({ storage: () => { throw new Error('blocked'); } });
  assert.equal(await blocked.get('a', 100, async () => 'ok'), 'ok');
  assert.equal(await blocked.get('a', 100, async () => 'unexpected'), 'ok');
  blocked.clear();
});
