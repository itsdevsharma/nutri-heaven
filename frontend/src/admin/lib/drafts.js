// Drafts are private to the signed-in admin and this browser. Each record has
// its own key so starting another entry cannot overwrite an unfinished one.
const PREFIX = 'nutri:admin-draft:v1:';
const sensitive = /password|secret|token|credential|authorization/i;
export function safeDraftValue(value) {
  if (Array.isArray(value)) return value.map(safeDraftValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitive.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key))
    .map(([key, item]) => [key, safeDraftValue(item)]));
  return value;
}
export const draftOwner = admin => admin?.id ?? admin?._id ?? admin?.email ?? null;
const ownerPrefix = owner => `${PREFIX}${encodeURIComponent(owner)}:`;
const keyFor = (owner, scope, record) => `${ownerPrefix(owner)}${encodeURIComponent(scope)}:${encodeURIComponent(record)}`;
export function readDraft(owner, scope, record = 'new', storage) {
  if (!owner) return null;
  try {
    storage ??= globalThis.localStorage;
    const entry = JSON.parse(storage.getItem(keyFor(owner, scope, record)));
    return entry?.version === 1 && entry.scope === scope && entry.record === record && entry.value !== undefined && Number.isFinite(entry.updatedAt) ? entry : null;
  } catch { return null; }
}
export function writeDraft(owner, entry, storage) {
  if (!owner) throw new Error('Sign in to save a draft.');
  storage ??= globalThis.localStorage;
  const saved = safeDraftValue({ ...entry, version: 1, updatedAt: Date.now() });
  storage.setItem(keyFor(owner, entry.scope, entry.record), JSON.stringify(saved));
  globalThis.window?.dispatchEvent(new Event('admin-drafts-changed'));
  return saved;
}
export function removeDraft(owner, scope, record, storage) {
  if (!owner) return;
  storage ??= globalThis.localStorage;
  storage.removeItem(keyFor(owner, scope, record));
  globalThis.window?.dispatchEvent(new Event('admin-drafts-changed'));
}
export function listDrafts(owner, storage) {
  if (!owner) return [];
  try {
    storage ??= globalThis.localStorage;
    const prefix = ownerPrefix(owner), entries = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const entry = JSON.parse(storage.getItem(key));
        if (entry?.version === 1 && typeof entry.scope === 'string' && typeof entry.record === 'string' && typeof entry.route === 'string' && entry.route.startsWith('/admin/') && entry.value !== undefined && Number.isFinite(entry.updatedAt)) entries.push(entry);
      } catch { /* Ignore an individual damaged entry. */ }
    }
    return entries.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}
