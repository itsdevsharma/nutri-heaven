import test from 'node:test';
import assert from 'node:assert/strict';
import { adminApi, ApiError, setUnauthorizedHandler } from '../src/admin/lib/api.js';

test('admin offers reject HTML and malformed lists, then recover on retry', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // Reproduces the frontend host returning its SPA HTML for an API route.
    globalThis.fetch = async () => new Response('<!doctype html><title>Nutri Heaven</title>', {
      headers: { 'Content-Type': 'text/html' },
    });
    await assert.rejects(adminApi.offers.list(), error => error instanceof ApiError && /VITE_API_URL/.test(error.message));

    for (const payload of [null, 'html', {}, { items: [] }]) {
      globalThis.fetch = async () => Response.json(payload);
      await assert.rejects(adminApi.offers.list(), /invalid offers list/);
    }

    for (const offers of [[], [{ _id: 'offer-1', name: 'Seasonal offer' }]]) {
      globalThis.fetch = async () => Response.json(offers);
      assert.deepEqual(await adminApi.offers.list(), offers);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin response validation preserves HTTP errors and session expiry handling', async () => {
  const originalFetch = globalThis.fetch;
  let expired = 0;
  setUnauthorizedHandler(() => { expired++; });
  try {
    globalThis.fetch = async () => Response.json({ message: 'Session expired' }, { status: 401 });
    await assert.rejects(adminApi.offers.list(), error => error.status === 401 && error.message === 'Session expired');
    assert.equal(expired, 1);

    globalThis.fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 });
    await assert.rejects(adminApi.offers.list(), error => error.status === 502 && error.message === 'The API could not handle this request.');
  } finally {
    setUnauthorizedHandler(null);
    globalThis.fetch = originalFetch;
  }
});
