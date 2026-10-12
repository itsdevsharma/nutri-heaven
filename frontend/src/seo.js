import { pageSeo, seoHead } from '../seo/site.js';
export function updateSeo({ settings, product, privateScreen = false }) {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const seo = pageSeo({ path, origin: import.meta.env.VITE_SITE_URL || window.location.origin, settings, product });
  if (privateScreen) seo.noindex = true;
  // Keep the server's valid product metadata while its browser data is loading.
  if (path.startsWith('/products/') && !product && document.querySelector('meta[property="og:type"][content="product"]')) return;
  const template = document.createElement('template');
  template.innerHTML = seoHead(seo);
  document.head.querySelectorAll('[data-seo], title').forEach(node => node.remove());
  document.head.appendChild(template.content);
}
