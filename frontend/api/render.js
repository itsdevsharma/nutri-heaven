import template from '../seo/generated-template.js';
import { appShell } from '../seo/app-shell.js';
import { PUBLIC_PAGES, pageSeo, seoHead, renderContent, isPrivatePath } from '../seo/site.js';
import { apiGet, getOrigin } from '../seo/server.js';
export default async function handler(req, res) {
  // Ubuntu supplies the active release; Vercel uses its bundled build template.
  const htmlTemplate = req.htmlTemplate ?? template;
  try {
    const raw = typeof req.query.path === 'string' ? req.query.path : '';
    const path = '/' + raw.replace(/^\/+|\/+$/g, '');
    const privatePage = isPrivatePath(path);
    const isProduct = /^\/products\/[^/]+$/.test(path);
    let missing = !PUBLIC_PAGES[path] && !isProduct && !privatePage;
    let product;
    let products = [];
    let settings = {};
    if (!missing && !privatePage) {
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
    const html = htmlTemplate.replace(/<!-- SEO_START -->[\s\S]*?<!-- SEO_END -->/, seoHead(pageSeo(data)))
      .replace('<div id="root"></div>', appShell(renderContent(data)));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', privatePage ? 'no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    if (missing || privatePage) res.setHeader('X-Robots-Tag', 'noindex, follow');
    return res.status(missing ? 404 : 200).send(html);
  } catch (error) {
    console.error('SEO rendering failed:', error.message);
    // Keep the storefront bootable during API outages without caching an
    // incomplete catalogue or telling crawlers that a product is missing.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    const html = htmlTemplate.replace('<div id="root"></div>', appShell('<main><h1>Nutri Heaven</h1><p>The store is temporarily unavailable. Please try again shortly.</p><a href="">Try again</a></main>'));
    return res.status(503).send(html);
  }
}
