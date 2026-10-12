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
    const error = new Error(Array.isArray(body.message) ? body.message.join('. ') : body.message ?? 'Request failed');
    error.status = response.status;
    throw error;
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
  browse: params => request(`/products/browse?${new URLSearchParams(params)}`),
  listProducts: (limit = 50, offset = 0) => request(`/products?limit=${limit}&offset=${offset}`),
  getProduct: (slug) => request(`/products/${encodeURIComponent(slug)}`),
  listCategories: () => request('/categories'),
  quote: (lines) => request('/products/quote', { method: 'POST', body: JSON.stringify({ lines }) }),
  quoteCoupon: (code, lines, email) => request('/coupons/quote', { method: 'POST', body: JSON.stringify({ code, lines, email }) }),
    placeOrder: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload), headers: localStorage.getItem(CUSTOMER_TOKEN_KEY) ? { Authorization: `Bearer ${localStorage.getItem(CUSTOMER_TOKEN_KEY)}` } : {} }),
  getOrder: (id) => request(`/orders/${encodeURIComponent(id)}`),
  publicSettings: () => request('/storefront/settings'),
  subscribe: payload => request('/newsletter/subscribe', { method: 'POST', body: JSON.stringify(payload) }),
  newsletterAction: (action, token) => request(`/newsletter/${action}`, { method: 'POST', body: JSON.stringify({ token }) }),
  reviews: slug => request(`/reviews/${encodeURIComponent(slug)}`),
  publicCms: () => request('/storefront/cms'),
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
  updateAddress: (id, payload) => customerRequest(`/customer/me/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  defaultAddress: id => customerRequest(`/customer/me/addresses/${encodeURIComponent(id)}/default`, { method: 'PATCH' }),
  removeAddress: id => customerRequest(`/customer/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  wishlist: () => customerRequest('/customer/me/wishlist'),
  addWishlist: productSlug => customerRequest('/customer/me/wishlist', { method: 'POST', body: JSON.stringify({ productSlug }) }),
  removeWishlist: slug => customerRequest(`/customer/me/wishlist/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  notifications: () => customerRequest('/customer/me/notifications'),
  readNotification: id => customerRequest(`/customer/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
  review: payload => customerRequest('/customer/me/reviews', { method: 'POST', body: JSON.stringify(payload) }),
  orderAction: (id, action, reason) => customerRequest(`/customer/me/orders/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  downloadReceipt: async id => {
    const response = await fetch(`${API_URL}/customer/me/orders/${encodeURIComponent(id)}/receipt`, { headers: { Authorization: `Bearer ${localStorage.getItem(CUSTOMER_TOKEN_KEY)}` } });
    if (!response.ok) throw new Error('Could not download this receipt. Please sign in and try again.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = `receipt-${id}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  orders: () => customerRequest('/customer/me/orders'),
};

export const paymentsApi = {
  config: () => request('/payments/razorpay/config'),
  create: id => request(`/payments/razorpay/orders/${encodeURIComponent(id)}`, { method: 'POST' }),
  status: id => request(`/payments/razorpay/orders/${encodeURIComponent(id)}`),
  verify: (id, payment) => request(`/payments/razorpay/orders/${encodeURIComponent(id)}/verify`, { method: 'POST', body: JSON.stringify(payment) }),
  cancel: id => request(`/payments/razorpay/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};
