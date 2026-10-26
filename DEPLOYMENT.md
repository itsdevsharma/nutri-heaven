# Deployment configuration

The Vercel storefront and Nest API are separate applications. A browser cannot
reach `localhost:3000` from Vercel: `localhost` means the visitor's device,
not the backend server.

## Vercel storefront

Set this Vercel project environment variable for **Production**, **Preview**
and the appropriate development environment, then redeploy. Vite injects it
at build time.

```text
VITE_API_URL=https://YOUR-PUBLIC-API-HOST
```

Do not use a trailing slash. The API host must be HTTPS and publicly reachable.

## Backend service

Set these variables on the service running `backend/`:

```text
NODE_ENV=production
MONGODB_URI=<production MongoDB connection string>
JWT_ACCESS_SECRET=<unique random secret of 32+ characters>
CORS_ORIGINS=https://nutri-heaven-mu.vercel.app
TRUST_PROXY=true
```

For preview deployments, append only the specific preview origins that need
access, separated by commas. Include local development origins only in the
development environment, not production. Do not use `*` with authenticated
requests.

After deployment, verify `GET https://YOUR-PUBLIC-API-HOST/health`, then open
the storefront and confirm `GET /products` succeeds in the browser network
panel. Rotate any database password that has appeared in a terminal, chat,
screenshot, commit, or deployment log.

## Production-hardening requirements

Follow [the operations runbook](docs/operations/PRODUCTION_HARDENING.md)
before the first public sale. In particular, configure daily encrypted MongoDB
backups with a cross-region retention copy, run a restore drill, set uptime and
error alerts, and enable a CDN/WAF rate limit in front of the API. The API's
in-process limiter is a fallback only; it cannot coordinate multiple replicas.

The backend refuses to start in production without `TRUST_PROXY=true`, an
explicit CORS allow-list and a strong JWT signing secret. It exposes
`/health/live` for liveness and `/health` (or `/health/ready`) for database
readiness. Keep the readiness endpoint behind the normal API hostname and do
not expose database or secret values in monitor labels.
