import test from 'node:test';
import assert from 'node:assert/strict';
import { draftOwner, listDrafts, readDraft, removeDraft, safeDraftValue, writeDraft } from '../src/admin/lib/drafts.js';

globalThis.window = new EventTarget();
class Storage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index]; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const entry = (record = 'new', scope = 'products') => ({ scope, record, title: 'Product', route: '/admin/products/new', value: { title: 'Unfinished' }, context: null });
test('partial records round-trip without required business fields', () => {
  const storage = new Storage();
  writeDraft('admin-1', entry(), storage);
  assert.equal(readDraft('admin-1', 'products', 'new', storage).value.title, 'Unfinished');
  assert.equal(listDrafts('admin-1', storage).length, 1);
});
test('accounts, modules and records remain isolated; deletion is precise', () => {
  const storage = new Storage();
  writeDraft('one', entry(), storage); writeDraft('two', entry(), storage);
  writeDraft('one', entry('almonds'), storage); writeDraft('one', entry('new', 'categories'), storage);
  removeDraft('one', 'products', 'new', storage);
  assert.equal(readDraft('one', 'products', 'new', storage), null);
  assert.equal(listDrafts('one', storage).length, 2);
  assert.equal(listDrafts('two', storage).length, 1);
  assert.equal(draftOwner({ id: '123', email: 'mail' }), '123');
  assert.equal(draftOwner(null), null);
});
test('passwords and credentials never reach browser storage, including nested context', () => {
  const storage = new Storage();
  writeDraft('one', { ...entry(), value: { name: 'Staff', password: 'private', passwordHash: 'hash', rows: [{ accessToken: 'token', size: '250g' }] }, context: { user: { secret: 'hidden', email: 'staff@example.test' } } }, storage);
  const raw = [...storage.values.values()][0];
  for (const text of ['private', 'hash', 'token', 'hidden']) assert.equal(raw.includes(text), false);
  assert.deepEqual(readDraft('one', 'products', 'new', storage).value, { name: 'Staff', rows: [{ size: '250g' }] });
  assert.deepEqual(safeDraftValue(JSON.parse('{"__proto__":{"polluted":true},"name":"Safe"}')), { name: 'Safe' });
});
test('damaged entries do not break the draft list or restoration', () => {
  const storage = new Storage();
  writeDraft('one', entry(), storage);
  storage.setItem(storage.key(0), '{broken');
  assert.equal(readDraft('one', 'products', 'new', storage), null);
  assert.deepEqual(listDrafts('one', storage), []);
});
test('storage failures are surfaced to the caller instead of reporting a saved draft', () => {
  const storage = new Storage(); storage.setItem = () => { throw new Error('QuotaExceeded'); };
  assert.throws(() => writeDraft('one', entry(), storage), /QuotaExceeded/);
  assert.throws(() => writeDraft(null, entry(), storage), /Sign in/);
});

test('blocked browser storage does not crash draft loading', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  try {
    assert.equal(readDraft('one', 'products'), null);
    assert.deepEqual(listDrafts('one'), []);
    assert.throws(() => writeDraft('one', entry()), /Storage blocked/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
