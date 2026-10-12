import template from '../seo/generated-template.js';
import { PUBLIC_PAGES, pageSeo, seoHead, renderContent } from '../seo/site.js';
import { apiGet, getOrigin } from '../seo/server.js';
export default async function handler(req, res) {
  try {
    const raw = typeof req.query.path === 'string' ? req.query.path : '';
    const path = '/' + raw.replace(/^\/+|\/+$/g, '');
    const isProduct = /^\/products\/[^/]+$/.test(path);
    let missing = !PUBLIC_PAGES[path] && !isProduct && path !== '/account';
    let product;
    let products = [];
    let settings = {};
    if (!missing && path !== '/account') {
      const results = await Promise.all([
        apiGet('/storefront/settings'),
        isProduct ? apiGet(`/products/${encodeURIComponent(decodeURIComponent(path.slice(10)))}`).catch(error => {
          if (error.status === 404) { missing = true; return null; }
          throw error;
        }) : path === '/' || path === '/shop' ? apiGet('/products?limit=100&offset=0') : Promise.resolve([]),
      ]);
      settings = results[0];
      if (isProduct) product = results[1];
      else products = results[1];
    }
    const data = { path, origin: getOrigin(), settings, product, products, missing };
    const html = template.replace(/<!-- SEO_START -->[\s\S]*?<!-- SEO_END -->/, seoHead(pageSeo(data)))
      .replace('<div id="root"></div>', `<div id="root">${renderContent(data)}</div>`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', path === '/account' ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
    if (missing || path === '/account') res.setHeader('X-Robots-Tag', 'noindex, follow');
    return res.status(missing ? 404 : 200).send(html);
  } catch (error) {
    console.error('SEO rendering failed:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('The store is temporarily unavailable. Please try again shortly.');
  }
}
