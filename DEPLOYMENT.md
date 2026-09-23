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
CORS_ORIGINS=https://nutri-heaven-topaz.vercel.app
```

For preview deployments, append only the specific preview origins that need
access, separated by commas. Do not use `*` with authenticated requests.

After deployment, verify `GET https://YOUR-PUBLIC-API-HOST/health`, then open
the storefront and confirm `GET /products` succeeds in the browser network
panel. Rotate any database password that has appeared in a terminal, chat,
screenshot, commit, or deployment log.
