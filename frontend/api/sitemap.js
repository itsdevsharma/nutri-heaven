import { sitemapXml } from '../seo/site.js';
import { allProducts, getOrigin } from '../seo/server.js';
export default async function handler(_req, res) {
  try {
    const products = await allProducts();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(sitemapXml(getOrigin(), products));
  } catch (error) {
    console.error('Sitemap generation failed:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('Sitemap temporarily unavailable');
  }
}
