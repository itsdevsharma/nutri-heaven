import { DEFAULT_SITE_URL, siteOrigin } from './site.js';
export const getOrigin = () => siteOrigin(process.env.SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE_URL);
export async function apiGet(path) {
  const origin = process.env.VITE_API_URL || process.env.API_URL;
  if (!origin) throw new Error('Set VITE_API_URL to the public backend origin for SEO rendering');
  const response = await fetch(`${origin.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const error = new Error(`Store API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
export async function allProducts() {
  const products = [];
  for (let offset = 0; offset < 49000; offset += 100) {
    const page = await apiGet(`/products?limit=100&offset=${offset}`);
    if (!Array.isArray(page)) throw new Error('Invalid product catalogue response');
    products.push(...page);
    if (page.length < 100) return products;
  }
  throw new Error('Catalogue requires a sitemap index before exceeding 49,000 products');
}
