// Read-only deployment checks. No account creation, email or payment operations.
const site = process.env.SMOKE_SITE_URL;
const api = process.env.SMOKE_API_URL;
if (!site || !api) throw new Error('Set SMOKE_SITE_URL and SMOKE_API_URL to the deployed HTTPS origins.');
for (const origin of [site, api]) if (new URL(origin).protocol !== 'https:') throw new Error('Deployment origins must use HTTPS.');
const checks = [
  [api, '/health', 'application/json', body => JSON.parse(body).status === 'ok'],
  [api, '/products/browse?limit=1', 'application/json', body => Array.isArray(JSON.parse(body).items)],
  [site, '/', 'text/html', body => /<title>/.test(body) && /\/assets\/index-/.test(body)],
  [site, '/shop', 'text/html', body => /canonical/.test(body)],
  [site, '/account', 'text/html', body => /noindex/.test(body)],
  [site, '/sitemap.xml', 'xml', body => /<urlset/.test(body)],
  [site, '/robots.txt', 'text/plain', body => /Sitemap:/.test(body)],
];
let failed = false;
for (const [origin, path, type, validate] of checks) {
  try {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    if (new URL(response.url).protocol !== 'https:') throw new Error('Redirect downgraded HTTPS');
    if (!response.ok || !response.headers.get('content-type')?.includes(type) || !validate(body)) throw new Error(`Unexpected status/content: ${response.status}`);
    console.log(`PASS ${path}`);
  } catch (error) { failed = true; console.error(`FAIL ${path}: ${error.message}`); }
}
// Browsers require both the actual response and the authorization preflight.
for (const method of ['GET', 'OPTIONS']) {
  try {
    const headers = { Origin: new URL(site).origin };
    if (method === 'OPTIONS') {
      headers['Access-Control-Request-Method'] = 'POST';
      headers['Access-Control-Request-Headers'] = 'authorization,content-type';
    }
    const response = await fetch(new URL('/health', api), {
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
