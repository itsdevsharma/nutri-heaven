export const DEFAULT_SITE_URL = 'https://nutri-heaven-topaz.vercel.app';
export const PUBLIC_PAGES = {
  '/': ['Nutri Heaven — Premium Dry Fruits, Nuts & Seeds', 'Shop premium dry fruits, nuts and seeds at Nutri Heaven. Discover fresh pantry favourites with delivery across India.'],
  '/shop': ['Shop Dry Fruits, Nuts & Seeds | Nutri Heaven', 'Explore the Nutri Heaven collection of dry fruits, premium nuts and seeds. Choose your favourite packs and order online.'],
  '/shipping-policy': ['Shipping Policy | Nutri Heaven', 'Read about Nutri Heaven delivery, shipping charges and order fulfilment.', 'shippingPolicy'],
  '/return-policy': ['Returns & Refunds | Nutri Heaven', 'Read the Nutri Heaven returns and refund policy and learn how to contact support.', 'returnPolicy'],
  '/privacy-policy': ['Privacy Policy | Nutri Heaven', 'Learn how Nutri Heaven handles your personal information and protects your privacy.', 'privacyPolicy'],
  '/terms': ['Terms & Conditions | Nutri Heaven', 'Read the terms and conditions for shopping with Nutri Heaven.', 'terms'],
};
export function siteOrigin(value = DEFAULT_SITE_URL) {
  const url = new URL(value || DEFAULT_SITE_URL);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('SITE_URL must be an HTTP(S) origin');
  return url.origin;
}
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
export function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
export function productPath(product) { return `/products/${encodeURIComponent(product.slug)}`; }
export function absoluteImage(value, origin) {
  if (!value) return `${origin}/assets/nutri-heaven-logo.jpeg`;
  const url = new URL(value.startsWith('/') || /^https?:\/\//.test(value) ? value : `/assets/${value}`, origin);
  return ['https:', 'http:'].includes(url.protocol) ? url.href : `${origin}/assets/nutri-heaven-logo.jpeg`;
}
export function pageSeo({ path = '/', origin = DEFAULT_SITE_URL, settings = {}, product, missing = false }) {
  origin = siteOrigin(origin);
  const page = PUBLIC_PAGES[path];
  const isProduct = path.startsWith('/products/');
  const noindex = missing || (!page && !isProduct) || (isProduct && !product);
  const title = missing ? 'Page Not Found | Nutri Heaven' : product ? product.seoTitle || `${product.title} | Nutri Heaven` : path === '/' && settings.seo?.title ? settings.seo.title : page?.[0] || 'Nutri Heaven';
  const description = product ? product.seoDescription || product.shortDescription || product.description : path === '/' && settings.seo?.description ? settings.seo.description : page?.[1] || 'Nutri Heaven customer portal.';
  const canonical = `${origin}${path}`;
  const image = absoluteImage(product?.image, origin);
  const organization = { '@type': 'Organization', '@id': `${origin}/#organization`, name: settings.legalName || 'Nutri Heaven', url: `${origin}/`, logo: `${origin}/assets/nutri-heaven-logo.jpeg`, ...(settings.supportEmail ? { email: settings.supportEmail } : {}), ...(settings.supportPhone ? { telephone: settings.supportPhone } : {}) };
  const graph = noindex ? [] : [organization, { '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: 'Nutri Heaven', publisher: { '@id': organization['@id'] } }];
  if (product && !noindex) {
    const variants = (product.variants || []).filter(variant => variant.isActive !== false);
    const variant = variants[0];
    const price = variant?.pricePaise ?? product.pricePaise;
    graph.push({ '@type': 'Product', name: product.title, description: product.description, image: [image], url: canonical, ...(variant?.sku ? { sku: variant.sku } : {}), brand: { '@type': 'Brand', name: 'Nutri Heaven' }, ...(Number.isFinite(price) && price > 0 ? { offers: { '@type': 'Offer', url: canonical, priceCurrency: 'INR', price: (price / 100).toFixed(2), availability: `https://schema.org/${variant?.stockQuantity > 0 ? 'InStock' : 'OutOfStock'}`, itemCondition: 'https://schema.org/NewCondition', seller: { '@id': organization['@id'] } } } : {}) });
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` }, { '@type': 'ListItem', position: 2, name: 'Shop', item: `${origin}/shop` }, { '@type': 'ListItem', position: 3, name: product.title, item: canonical }] });
  }
  return { title, description, canonical, image, noindex, type: product ? 'product' : 'website', verification: settings.seo?.googleSiteVerification || '', structuredData: { '@context': 'https://schema.org', '@graph': graph } };
}
export function seoHead(seo) {
  const meta = (name, content, property = false) => `<meta ${property ? 'property' : 'name'}="${name}" content="${escapeHtml(content)}" data-seo />`;
  return `<title>${escapeHtml(seo.title)}</title>
<link rel="canonical" href="${escapeHtml(seo.canonical)}" data-seo />
${meta('description', seo.description)}
${meta('robots', seo.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large')}
${meta('og:title', seo.title, true)}${meta('og:description', seo.description, true)}${meta('og:url', seo.canonical, true)}${meta('og:image', seo.image, true)}${meta('og:type', seo.type, true)}${meta('og:site_name', 'Nutri Heaven', true)}${meta('og:locale', 'en_IN', true)}
${meta('twitter:card', 'summary_large_image')}${meta('twitter:title', seo.title)}${meta('twitter:description', seo.description)}${meta('twitter:image', seo.image)}
${seo.verification ? meta('google-site-verification', seo.verification) : ''}
<script type="application/ld+json" data-seo>${safeJson(seo.structuredData)}</script>`;
}
export function renderContent({ path, settings = {}, product, products = [], missing = false, origin = DEFAULT_SITE_URL }) {
  const page = PUBLIC_PAGES[path];
  const title = missing ? 'Page not found' : product?.title || page?.[0] || 'Nutri Heaven';
  const text = product?.fullDescription || product?.description || (page?.[2] ? settings.content?.[page[2]] : path === '/' ? settings.content?.about : '') || page?.[1] || '';
  return `<main><nav><a href="/">Nutri Heaven</a> · <a href="/shop">Shop</a></nav><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>${product ? `<img src="${escapeHtml(absoluteImage(product.image, origin))}" alt="${escapeHtml(product.title)}" /><p>${escapeHtml(product.variants?.[0]?.size || 'Pack')} · ₹${((product.variants?.[0]?.pricePaise ?? product.pricePaise) / 100).toFixed(2)}</p>` : ''}${products.length ? `<ul>${products.map(item => `<li><a href="${productPath(item)}">${escapeHtml(item.title)}</a> — ${escapeHtml(item.shortDescription || item.description)}</li>`).join('')}</ul>` : ''}<footer><a href="/shipping-policy">Shipping</a> · <a href="/return-policy">Returns</a> · <a href="/privacy-policy">Privacy</a> · <a href="/terms">Terms</a></footer></main>`;
}
export function sitemapXml(origin, products = []) {
  origin = siteOrigin(origin);
  const entries = [...Object.keys(PUBLIC_PAGES).map(path => ({ path })), ...products.map(product => ({ path: productPath(product), modified: product.updatedAt }))];
  const unique = new Map(entries.map(entry => [entry.path, entry]));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...unique.values()].map(entry => `<url><loc>${escapeHtml(origin + entry.path)}</loc>${entry.modified && !Number.isNaN(Date.parse(entry.modified)) ? `<lastmod>${new Date(entry.modified).toISOString()}</lastmod>` : ''}</url>`).join('')}</urlset>`;
}
export function robotsTxt(origin) {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteOrigin(origin)}/sitemap.xml\n`;
}
