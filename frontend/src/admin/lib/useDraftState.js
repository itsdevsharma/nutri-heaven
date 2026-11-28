import { randomId } from '../../random-id.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '../router.jsx';
import { useSession } from '../session/session-context.js';
import { draftOwner, listDrafts, readDraft, removeDraft, writeDraft } from './drafts.js';

/** Writes at the edit, rather than on a timer/unload: immediate navigation and
 * closing the tab cannot cancel the final save. Initial API loads never write.
 * Only successful submission clears a draft; validation/network failures keep it.
 */
export function useDraftState(scope, initialValue, { title = scope, record = 'new' } = {}) {
  const { admin } = useSession();
  const { path, search } = useRouter();
  const owner = draftOwner(admin);
  const baseline = useRef(typeof initialValue === 'function' ? initialValue() : initialValue);
  const [frame, setFrame] = useState(() => {
    const requested = new URLSearchParams(search).get('draft');
    const candidate = requested || record !== 'new'
      ? readDraft(owner, scope, requested || record)
      : listDrafts(owner).find(entry => entry.scope === scope && entry.route === path);
    const saved = candidate?.route === path ? candidate : null;
    return { record: saved?.record ?? record, value: saved ? { ...baseline.current, ...saved.value } : baseline.current, context: saved?.context ?? null, savedAt: saved?.updatedAt ?? null, restored: Boolean(saved), edited: false, error: '' };
  });
  const current = useRef(frame);
  const config = useRef({ owner, scope, title, path });
  config.current = { owner, scope, title, path };
  const update = useCallback(next => { current.current = next; setFrame(next); }, []);
  const persist = useCallback(value => {
    const before = current.current;
    try {
      const { owner, scope, title, path } = config.current;
      const entry = writeDraft(owner, { scope, record: before.record, title, route: path, context: before.context, value });
      update({ ...before, value, savedAt: entry.updatedAt, restored: false, edited: true, error: '' });
      return true;
    } catch {
      update({ ...before, value, edited: true, error: 'Draft could not be saved in this browser. Keep this page open or submit the form to avoid losing your work.' });
      return false;
    }
  }, [update]);
  const setValue = useCallback(next => persist(typeof next === 'function' ? next(current.current.value) : next), [persist]);
  const initialize = useCallback(value => {
    baseline.current = value;
    if (!current.current.savedAt && !current.current.edited) update({ ...current.current, value });
  }, [update]);
  const begin = useCallback((value, context = null, record = 'new') => {
    baseline.current = value;
    const saved = readDraft(config.current.owner, config.current.scope, record);
    const next = { record, value: saved ? { ...value, ...saved.value } : value, context: saved?.context ?? context, savedAt: saved?.updatedAt ?? null, restored: Boolean(saved), edited: false, error: '' };
    update(next);
    return next;
  }, [update]);
  const clear = useCallback(() => {
    try {
      removeDraft(config.current.owner, config.current.scope, current.current.record);
      update({ ...current.current, savedAt: null, restored: false, edited: false, error: '' });
      return true;
    } catch {
      update({ ...current.current, error: 'The draft could not be removed. Please retry.' });
      return false;
    }
  }, [update]);
  const reset = useCallback(value => {
    if (!clear()) return false;
    const next = value === undefined ? baseline.current : value;
    baseline.current = next;
    update({ ...current.current, value: next, context: null, savedAt: null, restored: false });
    return true;
  }, [clear, update]);
  useEffect(() => {
    if (!frame.error) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [frame.error]);
  return [frame.value, setValue, { ...frame, initialize, begin, startNew: (value, context = null) => begin(value, context, `new-${randomId()}`), clear, reset, save: () => persist(current.current.value) }];
}
