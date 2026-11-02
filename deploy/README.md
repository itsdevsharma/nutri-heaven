Ubuntu production deployment
============================

The public site is https://nutriheaven.co.in. Build the storefront with
`VITE_API_URL=/api VITE_SITE_URL=https://nutriheaven.co.in`. The API listens on
127.0.0.1:3000; the route-aware HTML/SEO service listens on 127.0.0.1:3001.
Nginx serves assets and proxies HTML to the SEO service. Do not restore the old
SPA `try_files ... /index.html` fallback: it loses route metadata and HTTP 404s.

Server configuration
--------------------

Inside the existing HTTPS server block, retain the frontend dist root and
Certbot TLS directives. Replace old application locations with:

```nginx
include /etc/nginx/snippets/nutri-storefront.conf;
```

Install `nginx-api.conf` and `nginx-storefront.conf` under `/etc/nginx/snippets/`
using names `nutri-api.conf` and `nutri-storefront.conf`. The storefront snippet
already includes the API snippet. Do not also include `nginx-checkout.conf`.
The legacy checkout snippet is only for old deployments without the SEO service.
Canonical product pages use `/products/:slug`; API clients must use `/api`.
The unprefixed `/payments/razorpay/webhook` remains compatible.

Install the provided `nutri-*.service` and `nutri-*.timer` units into
`/etc/systemd/system/`, then run `systemctl daemon-reload`. Enable/start
`nutri-seo.service`, `nutri-backup.timer` and `nutri-monitor.timer`.
Run `nginx -t` before reloading. Confirm PM2 boot startup is enabled:

```bash
pm2 startup systemd -u deploy --hp /home/deploy
systemctl enable pm2-deploy
```

API and email environment
-------------------------

Keep `backend/.env` private and out of Git. Required production values include:

```dotenv
NODE_ENV=production
API_HOST=127.0.0.1
STOREFRONT_URL=https://nutriheaven.co.in
CORS_ORIGINS=https://nutriheaven.co.in,https://www.nutriheaven.co.in
TRUST_PROXY=true
TRUST_PROXY_CIDRS=loopback
```

Keep existing database, JWT, payment and media secrets. Resend requires a
verified domain sender in `MAIL_FROM` and a valid `RESEND_API_KEY`. The onboarding
sender is not accepted in production. A send-only key cannot inspect or verify
sender domains. Verify delivery after configuring the domain and sender.

The API's PM2 definition is `deploy/ecosystem.config.cjs`. It uses Node's
`--env-file` so secrets are read at every boot without copying them into PM2's
saved environment. When migrating from manually injected environment variables,
recreate the PM2 process once using a clean deploy-user environment so stale
values cannot override the file. Save the process list as the deploy user.

Updating a release
------------------

Commit intended source changes before deploying. On the server, first snapshot
and reconcile any manual edits; never discard them with a blind reset. Build
from the same commit as the reviewed source, and keep environment files separate.

```bash
cd /var/www/apps/nutri-heaven
git pull --ff-only
pnpm -C backend install --frozen-lockfile
pnpm -C frontend install --frozen-lockfile
pnpm -C backend build
VITE_API_URL=/api VITE_SITE_URL=https://nutriheaven.co.in pnpm -C frontend build
# As deploy, with no stale environment variables overriding backend/.env:
pm2 restart nutri-heaven-api
pm2 save
# As root:
systemctl restart nutri-seo
nginx -t && systemctl reload nginx
SMOKE_SITE_URL=https://nutriheaven.co.in SMOKE_API_URL=https://nutriheaven.co.in/api pnpm -C frontend audit:deployment
```

For atomic asset deployment, build into a release directory and switch `dist`
only after the build succeeds. Keep the previous release for rollback.

Administrator rotation
-----------------------

Do not run the catalogue seed in production: it overwrites stock and prices.
Generate a unique secret into a mode-0600 file, then from `backend/` run:

```bash
ADMIN_PASSWORD_FILE=/secure/path/new-admin-password ADMIN_EMAIL=admin@example.com node --env-file=.env scripts/rotate-admin.cjs
```

The utility updates only an existing active account and increments `authVersion`
to invalidate its existing sessions. Remove stale bootstrap passwords from `.env`.
Keep replacement credentials in a password manager; never commit them or paste
them into deployment logs. Rotate exposed provider keys in their own dashboards.

Backups and monitoring
----------------------

Install `mongodump` and `mongorestore` from the official MongoDB Database Tools
release for Ubuntu 24.04, verifying the download checksum. The backup script
expects `/usr/local/bin/mongodump`. See the [official installation guide](https://www.mongodb.com/docs/database-tools/installation/).

`nutri-backup.timer` runs daily at 21:00 UTC (02:30 IST), with up to 15 minutes
jitter and catch-up after downtime. Run `systemctl start nutri-backup` for an
immediate backup. Successful jobs write root-only application/configuration and
MongoDB archives under `/var/backups/nutri/daily`, retaining 14 days. Failed jobs
never remove good backups or update `last-success.json`. Archives contain secrets
and customer data: keep them private. These are local backups, not disaster
recovery against loss of the server. An off-server destination remains necessary.

The monitor checks public API/SEO endpoints and backup age every five minutes.
Failures appear in `systemctl --failed` and `journalctl -u nutri-monitor`.
This does not replace off-server uptime alerts.

Restore only into an isolated temporary database/server first. Extract
`database.archive.gz` from a backup, use `mongorestore --gzip --archive=...` with
`--nsFrom='SOURCE_DB.*' --nsTo='ISOLATED_RESTORE_DB.*'`, and compare collection
counts/indexes and representative records. Never point a rehearsal at the live
namespace. Restore tests do not establish point-in-time consistency for a live
busy database; use managed snapshots/oplog-based backups when required.

Store delivery and policies
---------------------------

`SHIPPING_RATE_MODE=store` uses configured weight/zone rates: ₹50 per started
500 g for local Hisar, ₹100 per started 3 kg within Haryana, ₹150 per started kg
interstate. Saved gross weight is used where available, otherwise metric pack
labels. Product prices already include tax. These rates do not book couriers.
Manual shipping is the approved operating mode for this release. Do not invent
parcel weights: Shiprocket requires measured packed weights, pickup details,
dimensions and API credentials before enabling courier mode.

`policies.json` contains the operational policy copy approved on 2 November 2026.
Publish those fields to the singleton store settings while preserving unrelated
settings. Future rate/window changes must also update the corresponding policy.

Outstanding acceptance
-----------------------

A live capture → provider webhook → inventory → email → manual fulfilment →
refund test still needs a controlled real purchase and payment-dashboard webhook
verification. Do not treat empty production order collections or mocked tests as
proof that this cycle works. Email delivery and Cloudinary upload need explicit
end-to-end checks; do not send test messages or create chargeable transactions
without choosing the recipient, order and amount with the operator.
