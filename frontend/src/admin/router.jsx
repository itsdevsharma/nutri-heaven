import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * The console's router: ~60 lines on the History API instead of a dependency.
 *
 * The storefront already makes routing decisions from `window.location.pathname`
 * (`/shop`, and now `/admin`), so the admin area follows the same convention and
 * stays dependency-free. `vite dev` and `vite preview` both fall back to
 * `index.html` for extensionless paths, which is what makes deep links such as
 * `/admin/products/almonds` work without extra config; a production reverse
 * proxy needs the equivalent `try_files` rule (documented in `ADMIN.md`).
 */

const RouterContext = createContext(null);

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(() => ({ pathname: window.location.pathname, search: window.location.search }));

  useEffect(() => {
    const syncFromHistory = () => setLocation({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', syncFromHistory);
    return () => window.removeEventListener('popstate', syncFromHistory);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const target = new URL(to, window.location.href);
    if (target.href === window.location.href) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
    setLocation({ pathname: window.location.pathname, search: window.location.search });
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ path: location.pathname, search: location.search, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useRouter must be used inside <RouterProvider>');
  return context;
}

/** Anchor that keeps middle-click/ctrl-click behaviour intact. */
export function Link({ to, replace = false, onClick, children, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/**
 * Segment match. Static segments score higher than `:params`, so
 * `/admin/products/new` wins over `/admin/products/:slug` regardless of the
 * order of the route table.
 */
export function matchPath(pattern, path) {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return null;

  const params = {};
  let score = 0;
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
      score += 1;
    } else if (patternSegment === pathSegment) {
      score += 2;
    } else {
      return null;
    }
  }
  return { params, score };
}

/** Best match for `path` across the route table, or `null`. */
export function matchRoutes(routes, path) {
  let best = null;
  routes.forEach((route) => {
    const match = matchPath(route.path, path);
    if (match && (!best || match.score > best.match.score)) best = { route, match };
  });
  return best ? { route: best.route, params: best.match.params } : null;
}
