/** Bounded, per-tab cache for public storefront data only. */
export function createStoreCache({ storage = () => globalThis.sessionStorage, now = Date.now, maxEntries = 80 } = {}) {
  const storageKey = 'nutri:public-cache:v1';
  const entries = new Map();
  const pending = new Map();
  let generation = 0;
  let restored = false;

  function restore() {
    if (restored) return;
    restored = true;
    try {
      const saved = JSON.parse(storage()?.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) for (const [key, entry] of saved.slice(-maxEntries)) {
        if (typeof key === 'string' && entry?.expiresAt > now() && 'value' in entry) entries.set(key, entry);
      }
    } catch { /* Blocked storage or invalid data must never prevent shopping. */ }
  }

  function persist() {
    for (const [key, entry] of entries) if (entry.expiresAt <= now()) entries.delete(key);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    try { storage()?.setItem(storageKey, JSON.stringify([...entries])); } catch { /* Memory cache still works. */ }
  }

  return {
    async get(key, ttl, load) {
      restore();
      const cached = entries.get(key);
      if (cached?.expiresAt > now()) return structuredClone(cached.value);
      if (pending.has(key)) return structuredClone(await pending.get(key));
      const startedGeneration = generation;
      const task = Promise.resolve().then(load).then(value => {
        if (generation === startedGeneration) {
          entries.set(key, { value: structuredClone(value), expiresAt: now() + ttl });
          persist();
        }
        return value;
      });
      pending.set(key, task);
      try { return structuredClone(await task); }
      finally { if (pending.get(key) === task) pending.delete(key); }
    },
    clear() {
      generation += 1;
      restored = true;
      entries.clear();
      pending.clear();
      try { storage()?.removeItem(storageKey); } catch { /* Storage is optional. */ }
    },
  };
}

export const storeCache = createStoreCache();
