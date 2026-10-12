SEO runs on the existing Vercel deployment. Public pages receive HTML titles, descriptions, canonical URLs, Open Graph/Twitter metadata and JSON-LD before React loads. The server also renders the main page text and product links. The browser refreshes metadata from the same SEO rules. The root route is explicitly handled before Vercel checks static files so the built index.html cannot bypass the homepage verification token. Admin and account pages are excluded from indexing; unknown pages and unpublished products return HTTP 404. API outages return HTTP 503 instead of pretending the product does not exist.

Deployment settings:

- Set `VITE_API_URL` to the deployed backend origin in Vercel. Public page rendering and sitemap generation need this API at runtime as well as in the browser.
- Set `VITE_SITE_URL` to the public storefront origin, for example `https://nutri-heaven-topaz.vercel.app`. When adding a custom domain, update this value and redeploy. Optional runtime `SITE_URL` overrides the server origin; keep it identical to `VITE_SITE_URL`.
- Deploy the backend changes alongside the frontend to enable the new SEO settings.
- In Admin → Store content → Google SEO, enter the homepage title/description and the Google Search Console HTML-tag verification token (only the `content` value). Product pages use each product's existing SEO title and description.
- In Google Search Console, verify the storefront property, then submit `https://YOUR_DOMAIN/sitemap.xml`. Verification and submission require access to your Google account.
- Inspect the homepage and product pages with Search Console URL Inspection and Google's Rich Results Test after deployment.

`/sitemap.xml` reads every published product from the API in batches of 100 and refreshes its CDN cache every five minutes. Draft, inactive and archived products are excluded by the public products endpoint. Static pages do not invent last-modified timestamps; products use their database `updatedAt`. `/robots.txt` points Google to the sitemap. The implementation supports up to 49,000 products; a larger catalogue needs a sitemap index.

Run `pnpm build` followed by `pnpm test:seo` in `frontend/` to check metadata, escaping, structured data, pagination and the production HTTP handlers. Vite's local dev/preview server serves the client app; use `vercel dev` to exercise the production SEO functions and rewrites. Other hosting platforms must provide equivalent server functions and routing.

Google documentation: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics and https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
