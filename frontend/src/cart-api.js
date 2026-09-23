const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const CART_ID_KEY = 'nutri_guest_cart_id';

export function cartId() {
  let id = localStorage.getItem(CART_ID_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(CART_ID_KEY, id);
  }
  return id;
}

async function request(path, options = {}) {
  let response;
  try { response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-cart-id': cartId(), ...options.headers },
  }); } catch { throw new Error('The store service is temporarily unavailable. Please try again shortly.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? 'Cart request failed');
  }
  return response.json();
}

export const cartApi = {
  get: () => request('/cart'),
  add: (productId, packSize, quantity = 1) => request('/cart/items', { method: 'POST', body: JSON.stringify({ productId, packSize, quantity }) }),
  update: (index, payload) => request(`/cart/items/${index}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: index => request(`/cart/items/${index}`, { method: 'DELETE' }),
  clear: () => request('/cart/items', { method: 'DELETE' }),
};

/** Storefront order placement — idempotent via `idempotencyKey`. */
export const storefrontApi = {
  listProducts: (limit = 50, offset = 0) => request(`/products?limit=${limit}&offset=${offset}`),
  getProduct: (slug) => request(`/products/${encodeURIComponent(slug)}`),
  listCategories: () => request('/categories'),
  quote: (lines) => request('/products/quote', { method: 'POST', body: JSON.stringify({ lines }) }),
    placeOrder: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  getOrder: (id) => request(`/orders/${encodeURIComponent(id)}`),
  publicSettings: () => request('/storefront/settings'),
};

const CUSTOMER_TOKEN_KEY = 'nutri_customer_access_token';
async function customerRequest(path, options = {}) {
  const token = localStorage.getItem(CUSTOMER_TOKEN_KEY);
  let response;
  try { response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); } catch { throw new Error('The account service is temporarily unavailable. Please try again shortly.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Customer request failed');
  return body;
}
export const customerApi = {
  token: () => localStorage.getItem(CUSTOMER_TOKEN_KEY),
  logout: () => localStorage.removeItem(CUSTOMER_TOKEN_KEY),
  signup: async payload => { const result = await customerRequest('/customer/auth/signup', { method: 'POST', body: JSON.stringify(payload) }); localStorage.setItem(CUSTOMER_TOKEN_KEY, result.accessToken); return result; },
  login: async payload => { const result = await customerRequest('/customer/auth/login', { method: 'POST', body: JSON.stringify(payload) }); localStorage.setItem(CUSTOMER_TOKEN_KEY, result.accessToken); return result; },
  forgotPassword: payload => customerRequest('/customer/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: async payload => { const result = await customerRequest('/customer/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }); localStorage.setItem(CUSTOMER_TOKEN_KEY, result.accessToken); return result; },
  me: () => customerRequest('/customer/me'),
  update: payload => customerRequest('/customer/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  addresses: () => customerRequest('/customer/me/addresses'),
  addAddress: payload => customerRequest('/customer/me/addresses', { method: 'POST', body: JSON.stringify(payload) }),
  removeAddress: id => customerRequest(`/customer/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  wishlist: () => customerRequest('/customer/me/wishlist'),
  addWishlist: productSlug => customerRequest('/customer/me/wishlist', { method: 'POST', body: JSON.stringify({ productSlug }) }),
  removeWishlist: slug => customerRequest(`/customer/me/wishlist/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  orders: () => customerRequest('/customer/me/orders'),
};
