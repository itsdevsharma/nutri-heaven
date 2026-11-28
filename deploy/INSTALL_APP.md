# Install Nutri Heaven

Nutri Heaven is an installable web app at https://nutriheaven.co.in. It uses the
existing customer and admin services and opens in a standalone app window.

- **Android:** open the site in Chrome, tap **Install app** in the site footer
  and confirm the browser prompt. The browser menu also offers installation or
  **Add to Home screen** when supported.
- **iPhone/iPad:** open the site in Safari → **Share → Add to Home Screen**.
  Keep **Open as Web App** enabled if offered, then tap **Add**.
- **Windows:** open the site in Chrome or Edge, choose the address-bar install
  icon or the site's **Install app** button and confirm.
- **Mac Safari:** open the site and choose **File → Add to Dock**.
- Staff can also find **Install app** at the bottom of the admin sidebar. Use a
  normal browser window; private/incognito windows do not support installation.

If the browser cannot show an installation prompt, the site's button displays
platform instructions. It hides when the site is already running in standalone
mode. Installation on the user's own device requires their browser confirmation;
the site cannot silently install an application.

## Offline behavior and updates

The service worker caches only a generic offline page and its app icon. It does
not cache API responses, account/admin pages, orders, prices, stock, payment data
or checkout submissions. Offline navigation displays a reconnect screen. **Try
again** returns to the original page after the connection is restored.

The app requires internet for shopping, checkout and admin operations. Its live
data and authentication behave as they do in the website. Worker versions follow
the production build; old offline caches are removed when a new worker activates.
Updates wait for existing app tabs/windows to close rather than reloading an
active checkout.

## Hosting

Deploy the manifest, service worker, offline page and app icons with the frontend
build. Nginx must serve `/manifest.webmanifest`, `/sw.js` and `/offline.html`
directly from `dist`, with revalidation enabled; the required exact locations are
in `nginx-storefront.conf`. Preserve its security headers. Assets already use the
existing `/assets/` location. Equivalent revalidation headers are in Vercel config.

`pnpm -C frontend audit:deployment` verifies the PWA resources, content types and
cache headers in addition to the existing production checks.
