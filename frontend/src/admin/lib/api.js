/**
 * The console's only door to the API.
 *
 * Everything the admin UI can do is listed in `adminApi`, so the shape of the
 * backend contract is visible in one file instead of being spread across pages.
 * Three rules hold everywhere:
 *
 * 1. Errors are always `ApiError`, carrying the HTTP status and the raw payload
 *    so a caller can branch on `status` without parsing strings.
 * 2. A 401 from an authenticated call fires the session's unauthorised handler
 *    exactly once, which drops the session and explains why on the login page.
 * 3. Money leaves the UI as integer paise and percentages as basis points —
 *    the API never receives a value the browser computed for display.
 *
 * The access token is kept in `sessionStorage`, not `localStorage`: it dies with
 * the tab. The backend issues a 15-minute access token and has no refresh
 * endpoint yet (step 1 of `backend/ADMIN_COMMERCE_PLAN.md`), which is why a
 * single retry seam is documented on `request()` rather than implemented here.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const SESSION_KEY = 'nutri_admin_session';

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

let unauthorizedHandler = null;

/** Registered by `SessionProvider`; `null` unregisters it. */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export const sessionStore = {
  read() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.accessToken && parsed?.admin ? parsed : null;
    } catch {
      return null;
    }
  },
  write(session) {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Private browsing can refuse storage; the in-memory session still works.
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing to do — there was no persisted session.
    }
  },
  token() {
    return sessionStore.read()?.accessToken ?? null;
  },
};

function apiMessage(payload, status) {
  const message = payload && typeof payload === 'object' ? payload.message : null;
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string' && message) return message;
  if (status === 401) return 'Your email or password is incorrect.';
  if (status === 403) return 'Your role does not allow this action.';
  if (status === 404) return 'That record no longer exists.';
  if (status >= 500) return 'The API could not handle this request.';
  return `Request failed with status ${status}.`;
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? sessionStore.token() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_URL}. Is the backend running?`, 0);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (response.status === 401 && auth && unauthorizedHandler) unauthorizedHandler();
  if (!response.ok) throw new ApiError(apiMessage(payload, response.status), response.status, payload);

  // Seam for refresh tokens: when `POST /admin/auth/refresh` exists, a 401 can
  // be retried here once before the session is dropped.
  return payload;
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const adminApi = {
  /** `POST /admin/auth/login` → `{ accessToken, admin }`. */
  login: (email, password) =>
    request('/admin/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  products: {
    /** Every lifecycle state, unlike the storefront's `GET /products`. */
    list: (params = {}) => request(`/products/admin${toQuery(params)}`),
    get: (slug) => request(`/products/admin/${encodeURIComponent(slug)}`),
    create: (payload) => request('/products/admin', { method: 'POST', body: payload }),
    update: (slug, payload) =>
      request(`/products/admin/${encodeURIComponent(slug)}`, { method: 'PATCH', body: payload }),
    duplicate: (slug) =>
      request(`/products/admin/${encodeURIComponent(slug)}/duplicate`, { method: 'POST' }),
    deactivate: (slug) =>
      request(`/products/admin/${encodeURIComponent(slug)}/deactivate`, { method: 'PATCH' }),
  },

  categories: {
    /** Flat list including inactive rows; the UI builds the tree. */
    list: () => request('/categories/admin'),
    create: (payload) => request('/categories/admin', { method: 'POST', body: payload }),
    update: (slug, payload) =>
      request(`/categories/admin/${encodeURIComponent(slug)}`, { method: 'PATCH', body: payload }),
    deactivate: (slug) =>
      request(`/categories/admin/${encodeURIComponent(slug)}/deactivate`, { method: 'PATCH' }),
  },

  inventory: {
    /**
     * `GET /inventory/admin` → `{ items, total, summary }` where each row is a
     * product pack with `state` ('healthy' | 'low' | 'out') computed by the API.
     * `view: 'low'` / `'out'` power the alert lists server-side, so the console
     * can never disagree with the API about what "low" means.
     */
    overview: (params = {}) => request(`/inventory/admin${toQuery(params)}`),
    /** Immutable movement history (opening, adjustment, order movements…). */
    movements: (params = {}) => request(`/inventory/admin/movements${toQuery(params)}`),
    /**
     * Manual adjustment: the operator sends the counted shelf balance, the API
     * derives the signed delta and appends the ledger row. `idempotencyKey`
     * (a client UUID) makes a retry or double-click a no-op.
     */
    adjust: (payload) => request('/inventory/admin/adjust', { method: 'PATCH', body: payload }),
  },

  orders: {
    list: () => request('/orders/admin'),
    get: (id) => request(`/orders/admin/${encodeURIComponent(id)}`),
    updateStatus: (id, status) => request(`/orders/admin/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } }),
    cancel: (id, reason) => request(`/orders/admin/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { reason } }),
  },

  settings: {
    get: () => request('/admin/settings'),
    update: (value) => request('/admin/settings', { method: 'PATCH', body: { value } }),
  },
};

export { API_URL };
