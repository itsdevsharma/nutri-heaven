import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data-fetching hook: one resource, explicit dependencies, no cache.
 *
 * The contract is deliberate. `loader` is created inline by the caller and
 * `deps` lists everything it closes over — the same rule `useCallback` /
 * `useEffect` already follow — so a page reads as
 * `useResource(() => adminApi.products.list({ status, offset }), [status, offset])`.
 *
 * Stale responses are dropped rather than applied: every load takes a ticket and
 * only the newest ticket may write state, which is what keeps fast typing in the
 * products search box from flashing an older page of results back onto screen.
 * Errors are returned, not thrown, so a page can render `ErrorState` and offer a
 * retry without an error boundary.
 */
export function useResource(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const ticket = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's dependency list
  const load = useCallback(async () => {
    const current = ticket.current + 1;
    ticket.current = current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const data = await loader();
      if (ticket.current === current) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (ticket.current === current) setState({ data: null, loading: false, error });
      return null;
    }
  }, deps);

  useEffect(() => {
    void load();
    return () => {
      // Invalidate the in-flight request on unmount or dependency change.
      ticket.current += 1;
    };
  }, [load]);

  const setData = useCallback((data) => {
    setState((previous) => ({ ...previous, data }));
  }, []);

  return { ...state, reload: load, setData };
}

/** Debounced mirror of a fast-changing value (search boxes, filter typing). */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
