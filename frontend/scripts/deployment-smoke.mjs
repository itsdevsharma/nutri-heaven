// Read-only deployment checks. No account creation, email or payment operations.
const site = process.env.SMOKE_SITE_URL;
const api = process.env.SMOKE_API_URL;
if (!site || !api) throw new Error('Set SMOKE_SITE_URL and SMOKE_API_URL to the deployed HTTPS site and API base URL (including /api when used).');
for (const origin of [site, api]) if (new URL(origin).protocol !== 'https:') throw new Error('Deployment origins must use HTTPS.');
const endpoint = (base, path) => new URL(path.replace(/^\/+/, ''), base.replace(/\/?$/, '/'));
const checks = [
  [api, '/health', 'application/json', body => JSON.parse(body).status === 'ok'],
  [api, '/products/browse?limit=1', 'application/json', body => Array.isArray(JSON.parse(body).items)],
  [api, '/checkout/configuration', 'application/json', body => JSON.parse(body).enabled === true],
  [api, '/payments/razorpay/config', 'application/json', body => {
    const config = JSON.parse(body);
    return config.enabled === true && config.testMode === false;
  }],
  [site, '/', 'text/html', body => /<title>/.test(body) && /\/assets\/index-/.test(body)],
  [site, '/shop', 'text/html', body => /canonical/.test(body)],
  [site, '/account', 'text/html', body => /noindex/.test(body)],
  [site, '/checkout', 'text/html', body => /name="robots" content="noindex/.test(body)],
  [site, '/admin/login', 'text/html', body => /name="robots" content="noindex/.test(body)],
  [site, '/sitemap.xml', 'xml', body => /<urlset/.test(body)],
  [site, '/robots.txt', 'text/plain', body => /Sitemap:/.test(body)],
];
let failed = false;
const checkedAssets = new Set();
for (const [origin, path, type, validate] of checks) {
  try {
    const response = await fetch(endpoint(origin, path), { signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    if (new URL(response.url).protocol !== 'https:') throw new Error('Redirect downgraded HTTPS');
    if (!response.ok || !response.headers.get('content-type')?.includes(type) || !validate(body)) throw new Error(`Unexpected status/content: ${response.status}`);
    if (origin === site && type === 'text/html') {
      for (const header of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy']) {
        if (!response.headers.get(header)) throw new Error(`Missing ${header}`);
      }
      const canonical = body.match(/rel="canonical" href="([^"]+)"/)?.[1];
      if (canonical !== new URL(path, site).href) throw new Error('Incorrect initial canonical URL');
      const assets = [...body.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
      if (!assets.some(asset => asset.endsWith('.js')) || !assets.some(asset => asset.endsWith('.css'))) throw new Error('Missing built JS or CSS references');
      for (const asset of assets) {
        if (checkedAssets.has(asset)) continue;
        const assetResponse = await fetch(endpoint(site, asset), { signal: AbortSignal.timeout(20000) });
        const contentType = assetResponse.headers.get('content-type') || '';
        const content = await assetResponse.text();
        const validType = asset.endsWith('.css') ? /^text\/css\b/i.test(contentType) : /^(?:application|text)\/(?:javascript|ecmascript)\b/i.test(contentType);
        if (!assetResponse.ok || !validType || /^\s*(?:<!doctype|<html)/i.test(content)) throw new Error(`Broken build asset ${asset}: ${assetResponse.status} ${contentType}`);
        checkedAssets.add(asset);
        console.log(`PASS asset ${asset}`);
      }
    }
    console.log(`PASS ${path}`);
  } catch (error) { failed = true; console.error(`FAIL ${path}: ${error.message}`); }
}
try {
  const response = await fetch(endpoint(site, '/deployment-check-page-does-not-exist'), { signal: AbortSignal.timeout(20000) });
  if (response.status !== 404 || !response.headers.get('x-robots-tag')?.includes('noindex')) throw new Error('Missing page must return HTTP 404 and noindex');
  console.log('PASS missing page HTTP 404');
} catch (error) { failed = true; console.error(`FAIL missing page: ${error.message}`); }
// A JSON 401 proves the protected route reached NestJS without exposing data.
for (const path of ['/inventory/admin', '/admin/settings', '/admin/offers', '/admin/coupons', '/admin/audit', '/admin/users', '/admin/engagement/report', '/admin/cms/faqs', '/admin/shipping/configuration']) {
  try {
    const response = await fetch(endpoint(api, path), { signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    if (response.status !== 401 || body.statusCode !== 401) throw new Error('Expected a protected JSON API response');
    console.log(`PASS protected ${path}`);
  } catch (error) { failed = true; console.error(`FAIL protected ${path}: ${error.message}`); }
}
// Browsers require both the actual response and the authorization preflight.
for (const method of ['GET', 'OPTIONS']) {
  try {
    const headers = { Origin: new URL(site).origin };
    if (method === 'OPTIONS') {
      headers['Access-Control-Request-Method'] = 'POST';
      headers['Access-Control-Request-Headers'] = 'authorization,content-type';
    }
    const response = await fetch(endpoint(api, '/health'), {
      method, headers, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok || response.headers.get('access-control-allow-origin') !== new URL(site).origin)
      throw new Error('Expected explicit storefront origin in Access-Control-Allow-Origin');
    if (method === 'OPTIONS') {
      const allowed = (response.headers.get('access-control-allow-headers') || '').toLowerCase();
      if (!allowed.includes('authorization') || !allowed.includes('content-type'))
        throw new Error('Authorization/content-type preflight rejected');
      if (!(response.headers.get('access-control-allow-methods') || '').split(/[,\s]+/).includes('POST'))
        throw new Error('POST preflight rejected');
    }
    if (new URL(response.url).protocol !== 'https:') throw new Error('Redirect downgraded HTTPS');
    console.log(`PASS CORS ${method}`);
  } catch (error) { failed = true; console.error(`FAIL CORS ${method}: ${error.message}`); }
}
process.exitCode = failed ? 1 : 0;
