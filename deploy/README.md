Ubuntu deployment
=================

The storefront and admin console use `/api` in production by default. Set
`VITE_API_URL` to an absolute backend origin only when hosting the API separately.
Admin page URLs such as `/admin/offers` must serve HTML; `/api/admin/offers` must
reach NestJS and return JSON. Do not proxy all `/admin` requests to NestJS.

Nginx setup (once)
-----------------

Copy `nginx-api.conf` into `/etc/nginx/snippets/nutri-api.conf`, then include it
inside the existing HTTPS server block:

```nginx
include /etc/nginx/snippets/nutri-api.conf;
```

Keep the existing frontend `try_files $uri $uri/ /index.html` location and any
existing Razorpay webhook route. Run `sudo nginx -t` before reloading Nginx.
The separate `nginx-checkout.conf` is for legacy checkout API URLs; do not include
it twice if those locations are already configured.

Update the application
----------------------

Commit and push the intended local changes. On the server, preserve/reconcile
tracked server edits before pulling; in particular retain the production API's
loopback binding in `backend/src/main.ts`. Keep backend `.env` out of Git.

As the `deploy` user:

```bash
cd /var/www/apps/nutri-heaven
git pull --ff-only
cd backend
pnpm install --frozen-lockfile && pnpm build
cd ../frontend
pnpm install --frozen-lockfile
VITE_API_URL=/api VITE_SITE_URL=https://nutriheaven.co.in pnpm build
cd ../backend
node --env-file=.env "$(command -v pm2)" restart nutri-heaven-api --update-env
pm2 save
```

Store delivery policy
---------------------

`SHIPPING_RATE_MODE=store` is the default. The configured customer charges are
₹50 per started 500 g for local Hisar delivery, ₹100 per started 3 kg within
Haryana, and ₹150 per started kg interstate. City/state and configured PIN
prefixes determine the zone; see `.env.example` for the editable rates and zones.
Each line uses its saved gross shipping weight when available, otherwise the
metric pack label. Unsupported pack labels require a saved shipping weight.
Product prices already include tax; checkout does not add it again.

These are store charges, independent of courier serviceability or costs. They
require no Shiprocket credentials and do not automatically create shipments.
Pack and verify orders before arranging delivery manually or booking through
Shiprocket with actual pickup and parcel metadata. Use `SHIPPING_RATE_MODE=shiprocket`
to restore live courier quotes after configuring the integration.

Quick public checks
-------------------

```bash
curl -sS https://nutriheaven.co.in/api/health
curl -sS https://nutriheaven.co.in/api/checkout/configuration
curl -sS https://nutriheaven.co.in/api/payments/razorpay/config
curl -i https://nutriheaven.co.in/api/inventory/admin
```

The last request should return JSON with HTTP 401, not website HTML.
For the broader deployment audit use `SMOKE_SITE_URL=https://nutriheaven.co.in`
and `SMOKE_API_URL=https://nutriheaven.co.in/api` with `pnpm audit:deployment`.
