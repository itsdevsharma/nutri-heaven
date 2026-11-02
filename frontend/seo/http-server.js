// Ubuntu/Nginx adapter for the same handlers used on Vercel. Nginx serves
// public assets; every HTML request goes through route-aware rendering.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import render from '../api/render.js';
import robots from '../api/robots.js';
import sitemap from '../api/sitemap.js';
import { getOrigin } from './server.js';

export function createSeoServer() {
  return createServer(async (request, response) => {
    response.status = code => { response.statusCode = code; return response; };
    response.send = body => { response.end(request.method === 'HEAD' ? undefined : body); return response; };
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return response.status(405).send('Method not allowed');
    }
    try {
      const url = new URL(request.url, getOrigin());
      const path = url.pathname;
      // Normalize before the renderer so canonical URLs never contain a second
      // spelling for the same route. Preserve query strings used by accounts.
      if (path !== '/' && /\/$/.test(path)) {
        response.setHeader('Location', path.replace(/\/+$/, '') + url.search);
        return response.status(308).send('');
      }
      if (path === '/robots.txt') return robots(request, response);
      if (path === '/sitemap.xml') return await sitemap(request, response);
      request.query = { path: path === '/index.html' ? '' : path.slice(1) };
      return await render(request, response);
    } catch {
      response.setHeader('Cache-Control', 'no-store');
      response.status(500).send('Storefront temporarily unavailable');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = new URL(getOrigin());
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('SITE_URL must use HTTPS');
  if (!process.env.API_URL) throw new Error('Set API_URL to the backend origin (http://127.0.0.1:3000 on Ubuntu)');
  const server = createSeoServer();
  server.requestTimeout = 30_000;
  server.listen(Number(process.env.SEO_PORT || 3001), '127.0.0.1');
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
