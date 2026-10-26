# Production hardening runbook

This runbook is the release gate for the Nutri Heaven storefront and API. It
does not replace controls provided by the hosting, MongoDB, payment, or email
provider; it records the minimum configuration and the evidence that must be
kept for each release.

## 1. Required production configuration

- Set `NODE_ENV=production`, `TRUST_PROXY=true`, a 32+ character unique
  `JWT_ACCESS_SECRET`, and a precise HTTPS-only `CORS_ORIGINS` list.
- Store all secrets in the host's encrypted secret manager, never in Vercel
  variables that are prefixed `VITE_`, source control, ticket comments, logs,
  screenshots, or client-side code.
- Put the API behind an HTTPS load balancer/CDN. Enable its managed WAF and
  rate limits for `/admin/auth/login`, payment endpoints, and all write
  endpoints. Match or tighten the backend defaults in `.env.example`.
- Configure MongoDB network access to allow only the API service egress IPs or
  private network. Do not expose MongoDB, Redis, MinIO, or the Nest API's
  development ports to the public internet.
- Leave HTTPS redirect and HSTS enabled at the edge. The API emits HSTS only
  for secure requests; the storefront sends it through `vercel.json`.

## 2. Backups and restore drill

Use a managed MongoDB backup service or a scheduled `mongodump` job that writes
an encrypted, access-controlled archive to separate object storage. A database
snapshot on the same account/region is not a disaster-recovery backup.

| Item | Minimum policy | Evidence to retain |
| --- | --- | --- |
| MongoDB backup | Daily full backup, point-in-time recovery if the provider supports it | Job status and archive/snapshot ID |
| Retention | 35 daily copies, 12 monthly copies, and one cross-region copy | Provider retention policy screenshot/export |
| Media | Versioning plus a separate lifecycle/retention policy | Bucket versioning and restore test record |
| Restore drill | Before launch and at least quarterly | Date, operator, duration, record counts, checkout smoke result |

Run restore drills only in an isolated account or database name. Never restore
over production. The drill must verify: product count, active prices/variants,
order count and totals, inventory balances, admin login, customer login, and a
read-only storefront checkout journey. Delete the isolated restore after the
results are recorded.

Suggested commands for an isolated target (substitute approved secret-manager
references locally; do not paste production URIs into a terminal history):

```powershell
mongodump --uri $env:BACKUP_SOURCE_URI --archive=nutri-heaven.archive.gz --gzip
mongorestore --uri $env:RESTORE_TARGET_URI --archive=nutri-heaven.archive.gz --gzip --drop
```

Encrypt the archive at rest through the backup bucket/KMS, restrict recovery
operators, and remove any temporary local archive immediately according to the
organisation's approved secure-disposal process.

## 3. Monitoring, logging, and alerting

Monitor from an external region at least every minute:

- `GET /health/live` confirms the process is running.
- `GET /health` or `/health/ready` confirms MongoDB connectivity.
- A browser synthetic check confirms homepage, product browse, cart, and a
  non-charging checkout start work from the public storefront.

Alert the on-call owner for failed readiness checks, 5xx rate above 1% for five
minutes, payment webhook dead letters, sustained 429 spikes, backup failures,
and MongoDB storage/connection thresholds. Send access and application logs to
the host log sink with at least 30 days retention. The API emits JSON access
logs containing request ID, method, path, status, and duration only—do not add
headers, request bodies, passwords, bearer tokens, customer contacts, payment
payloads, or full MongoDB URIs to logs.

Capture the response `X-Request-Id` in support tickets so an operator can trace
a failing request without asking a customer for sensitive details.

## 4. Secret rotation

Rotate immediately after suspected exposure and on a scheduled 90-day cadence
for application/API secrets. Rotate database users, Razorpay keys/webhook
secret, Resend key, Cloudinary/S3 credentials, MARG credentials once added,
and the JWT signing key independently.

For a planned JWT rotation:

1. Generate a new random 32+ character secret in the secret manager.
2. Put the old value in `JWT_ACCESS_SECRET_PREVIOUS` and the new value in
   `JWT_ACCESS_SECRET`; deploy every API replica.
3. Keep the previous value only for the maximum live token duration (seven days
   for customers; admin tokens expire in 15 minutes), then remove it and deploy
   again.
4. For an emergency compromise, remove the previous secret immediately and
   increment affected users' auth versions or force re-login.

After rotating a payment webhook secret, update the provider configuration and
deliver a signed test webhook before considering the change complete.

## 5. Security review release checklist

- [ ] `pnpm build` and the backend test suite pass from a clean dependency install.
- [ ] Production API refuses to boot without explicit CORS, `TRUST_PROXY=true`,
      and a strong JWT secret.
- [ ] CORS permits only known HTTPS storefront origins; no wildcard is used for
      authenticated requests.
- [ ] CSP, HSTS, `nosniff`, frame protection, referrer policy, and permissions
      policy are visible on the production storefront and API responses.
- [ ] CDN/WAF and backend rate limits have been tested, including login and
      payment routes; a legitimate checkout still completes after limits reset.
- [ ] Dependency vulnerability scan (`pnpm audit --prod`) is reviewed and any
      high/critical finding is resolved or explicitly risk-accepted.
- [ ] A separate authenticated and unauthenticated review confirms admin,
      customer, payment webhook, uploads, CORS, and object-storage permissions.
- [ ] Backup restore drill and monitoring alert test evidence are attached to
      the release record.
- [ ] No live key, password, customer data, or production URI exists in git,
      build logs, browser bundles, or public error responses.

Passing the code checks does not substitute for this final deployment review:
the backup destination, WAF/CDN, monitoring provider, DNS/TLS configuration,
and secret manager are external systems that must be verified in the deployed
environment.
