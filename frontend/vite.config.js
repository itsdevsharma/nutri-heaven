import { defineConfig, loadEnv } from 'vite';
import { pageSeo, seoHead } from './seo/site.js';
import react from '@vitejs/plugin-react';

// @vitejs/plugin-react was already a dependency but was never wired up, which
// meant no React Fast Refresh in development. Vite's root is this directory, so
// `public/assets/*` is still served at `/assets/*` and the `/src/main.jsx`
// reference in index.html resolves exactly as it did before the monorepo move.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), {
      name: 'store-seo',
      transformIndexHtml(html) {
        return html.replace(/<!-- SEO_START -->[\s\S]*?<!-- SEO_END -->/, `<!-- SEO_START -->${seoHead(pageSeo({ origin: env.VITE_SITE_URL }))}<!-- SEO_END -->`);
      },
    }],
    server: {
      port: 5173,
    },
  };
});
