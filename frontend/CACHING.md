# Storefront caching

Public catalogue responses use a bounded per-tab memory and sessionStorage cache:

| Content | Lifetime |
| --- | --- |
| Product lists, filtered browse results, individual products | 60 seconds |
| Categories, public store settings, banners, FAQs and social links | 5 minutes |

Keys include the API origin, endpoint and query parameters. Concurrent reads of the same key share a request. Expired entries are fetched again; failed requests are never cached or served as stale data. Browser storage is optional, with memory caching as a fallback. The cache holds at most 80 entries.

Successful writes through the storefront request client and admin JSON client clear public cached data in that tab. Other tabs and other visitors refresh on expiry. Clearing the cache also prevents an older in-flight request from repopulating it. Expiry is checked on the next read; it does not automatically refresh an already displayed page.

Cart, account, order, checkout, stock quotes and admin reads bypass this cache. The API sends `Cache-Control: no-store`; final price and availability continue to be checked by the server.

## Assets and hosting

Vercel configuration caches built JavaScript/CSS for one year with `immutable` (Vite changes their filenames when content changes). Public images and fonts cache for one day and revalidate after expiry. Keep filename versioning for replacements that must appear immediately. HTML entry files revalidate; the existing SEO renderer retains its short CDN cache and excludes account pages.

Local backend uploads cache for one day with revalidation. Cloudinary images follow the image provider's policy. Hosting header changes take effect after deployment; Vite development responses do not use Vercel's production headers.

No service worker or offline checkout is introduced.

## Verification

Run `node --test test/store-cache.test.js` from `frontend/`. Coverage includes expiry, persistence, concurrent reads, error retries, mutation invalidation during in-flight reads, capacity limits and unavailable browser storage.
