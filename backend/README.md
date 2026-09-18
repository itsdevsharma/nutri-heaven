# Nutri Heaven

Premium dry fruits, nuts and seeds — storefront for the Indian market.

> **Status: phase 2 of 6 — NestJS + MongoDB API.** Two self-contained pnpm
> packages at the repository root (`frontend/`, `backend/`) with local
> infrastructure (MongoDB, Redis, S3-compatible object storage) wired up. The
> application is the original customer storefront, plus a catalogue + pricing
> API serving the 8 products from MongoDB (`GET /products`,
> `GET /products/:slug`, `POST /products/quote` with server-side pricing).
> The storefront does not call the API yet — wiring the UI is phase 3. There
> is no order creation, authentication or admin panel yet. The storefront
> order flow is still a demo: nothing is persisted and no email, SMS or
> WhatsApp message is actually sent. See [Roadmap](#roadmap) for the target
> architecture and phase plan.

## What works today

- Product catalogue (8 products) with category tiles, hero, story and FAQ sections
- Cart drawer with quantity controls, subtotal, delivery charge and free-shipping threshold
- Checkout form (contact, delivery address, COD / UPI-card demo option) with required-field validation
- Order confirmation screen
- Responsive layout (mobile nav, cart drawer, scrim)
- NestJS API on MongoDB: `GET /products`, `GET /products/:slug`, `POST /products/quote` (server-side pricing), `GET /health` — seeded and covered by an e2e suite

## What does not work today

| Area | Current behaviour |
| --- | --- |
| Catalogue | 8 products hardcoded in `frontend/src/App.jsx`; the same 8 live in MongoDB via `pnpm backend:seed` but the storefront does not read them yet (phase 3) |
| Persistence | None. Refreshing the page empties the cart and loses the order |
| Orders | `placeOrder()` fabricates an order id from `Date.now()` — it is never submitted anywhere |
| Payments | Demo only. The checkout screen is labelled "Secure demo checkout" |
| Notifications | None. The confirmation screen promises updates by email but no message is sent |
| Authentication | None |
| Shipping | The free-shipping rule (`₹999`, else `₹79`) is still duplicated inside the cart and checkout components and can drift apart — they already disagree about an empty cart. The backend uses one local definition in `backend/src/common/pricing.ts`; the UI does not import it yet. |
| Pricing | Totals are computed in the browser, so prices are trusted from the client |

## Tech stack

| Layer | Choice |
| --- | --- |
| API | [NestJS](https://nestjs.com/) 11 + [Mongoose](https://mongoosejs.com/) 8 on Node.js 22 — see [NESTJS.md](NESTJS.md) for how it works |
| Database | MongoDB 7 (single-node replica set in development) |
| Validation | `class-validator` + `class-transformer` via a global `ValidationPipe` |
| Package manager | [pnpm](https://pnpm.io/) 12 — `frontend/` and `backend/` are independent pnpm projects (own lockfiles, no workspace); a thin root `package.json` provides the combined scripts |
| Storefront | [Vite](https://vite.dev/) 8 + [React](https://react.dev/) 19 (plain JSX — no TypeScript yet) |
| Styling | Plain CSS design system in `frontend/style.css` (custom properties, no framework) |
| Local infrastructure | Docker Compose — MongoDB 7, Redis 7, S3-compatible object storage |

Requires **Node.js 22+** (developed on v22.22.2) and Docker for local
infrastructure. Activate the pinned pnpm once:

```bash
corepack enable
```

## Getting started

```bash
corepack enable   # once, to activate the pinned pnpm
pnpm install:all  # install frontend/ and backend/ (independent pnpm projects)
pnpm infra:up     # start MongoDB, Redis and object storage
pnpm backend:seed # load the 8 products into MongoDB
pnpm dev          # storefront at http://localhost:5173, API at http://localhost:3000
```

### Common commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the storefront and API together (storefront at http://localhost:5173) |
| `pnpm build` | Build the frontend and backend packages |
| `pnpm frontend:dev` / `pnpm frontend:build` | Target the storefront only |
| `pnpm backend:dev` | Run the API with hot reload (http://localhost:3000) |
| `pnpm backend:build` / `pnpm backend:seed` / `pnpm backend:test` | Build the API, seed the catalogue, run the e2e suite |
| `pnpm infra:up` | Start the infrastructure, waiting until every service is healthy |
| `pnpm infra:buckets` | Create/re-apply the media bucket (one-shot, idempotent) |
| `pnpm infra:down` | Stop the infrastructure containers |
| `pnpm infra:reset` | Stop the containers **and delete all data volumes** |
| `pnpm infra:logs` | Follow infrastructure logs |
| `pnpm clean` | Remove build output |

### Local infrastructure

| Service | Address | Credentials |
| --- | --- | --- |
| MongoDB | `localhost:27017` | none in development (binds `127.0.0.1` only) |
| Redis | `localhost:6379` | none in development |
| Object storage API | `localhost:9000` | user `nutri` |
| Object storage console | http://localhost:9001 | user `nutri` |
| API | http://localhost:3000 | — (`/health`, `/products`, `/products/quote`) |

Passwords here are development-only placeholders. Copy `backend/.env.example`
to `backend/.env` to override any of them — `.env` is git-ignored and Compose
loads it from the backend directory.

MongoDB runs as a **single-node replica set** (`--replSet rs0`) because
multi-document transactions — coming in phase 3 for order creation + stock
decrement — only exist on replica sets. The pinned image is `mongo:7.0`, not
`mongo:8`: MongoDB 8 refuses to boot on kernels ≥ 6.19 (SERVER-121912) and
this host runs kernel 7.0.x.

Redis runs with `--maxmemory-policy noeviction` because BullMQ must never have
its job keys evicted. Object storage is pulled from `quay.io`, not Docker Hub;
MinIO retired its community images, so `minio/minio` no longer resolves.

The API ([how it works](NESTJS.md)) serves the catalogue
from MongoDB — `GET /products`, `GET /products/:slug` — and prices carts
server-side via `POST /products/quote` (client sends slugs + quantities only;
prices come from the database, shipping uses the backend pricing rule in
`src/common/pricing.ts`). Seed with `pnpm backend:seed`, test with
`pnpm backend:test`.

## Repository layout

```text
.
├── package.json                # Thin root dispatcher for frontend/ and backend/
├── frontend/                   # Customer storefront (Vite + React)
│   ├── index.html              # Vite entry document
│   ├── src/
│   │   ├── main.jsx            # React bootstrap
│   │   └── App.jsx             # Catalogue, cart, checkout, confirmation
│   ├── public/assets/          # Product/category images (served at /assets/*)
│   ├── style.css               # Design system and component styles
│   └── vite.config.js          # React plugin wiring
├── backend/                    # NestJS API (Mongoose + MongoDB)
│   ├── package.json            # Self-contained pnpm package
│   ├── pnpm-lock.yaml          # Backend dependency lockfile
│   ├── docker-compose.yml      # MongoDB, Redis and object storage
│   ├── .env.example            # Infrastructure/API overrides
│   ├── src/
│   │   ├── main.ts             # Bootstrap: ValidationPipe, CORS, listen
│   │   ├── app.module.ts       # Root module: Config, Mongoose, Products
│   │   ├── health.controller.ts # GET /health
│   │   ├── products/           # Controller, service, schema, DTOs
│   │   └── seed.ts             # Idempotent catalogue seed (8 products)
│   ├── test/                   # E2E suite (supertest + in-memory MongoDB)
│   └── NESTJS.md               # How the NestJS API works, file by file
└── frontend/pnpm-lock.yaml      # Frontend dependency lockfile
```

## Roadmap

The target platform is a monorepo — the customer site and admin panel share one
API, and all background work runs outside the request/response path:

```
Customer Website (Next.js)        Admin Panel (Next.js/React)
              │                              │
              └──────────────┬───────────────┘
                             ▼
                   API Layer (NestJS + TypeScript)
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   MongoDB               Redis             Object Storage
                             │
                             ▼
                    Worker/Jobs (BullMQ)
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
           Email            SMS           WhatsApp
```

### Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Repository hygiene — `.gitignore`, untrack `node_modules/` and `dist/`, README | done |
| 1 | Monorepo skeleton; move the SPA to `frontend` unchanged; MongoDB + Redis + object storage via Compose | done |
| 2 | NestJS + Mongoose (MongoDB) API: catalogue endpoints, server-side pricing, [NestJS explainer](backend/NESTJS.md) | done |
| 3 | Storefront on the API; real order creation with idempotency; Razorpay + COD | next |
| 4 | BullMQ worker with email / SMS / WhatsApp providers, retries and a notification log | planned |
| 5 | Admin panel: products, inventory, orders, fulfilment, coupons, notification log | planned |
| 6 | Hardening: observability, backups, CI/CD, DLT and WhatsApp template registration | planned |

### Known gaps not covered by the diagram

Payment gateway webhooks, shipping/logistics integration and PIN-code
serviceability, GST invoicing details, messaging compliance for India (DLT
sender IDs and templates for SMS, pre-approved opt-in templates for WhatsApp),
idempotency and stock-decrement concurrency, observability, secrets management,
CI/CD and database backups.

## Contributing

- Keep the existing visual design when re-platforming — do not re-skin and
  re-architect at the same time.
- Use **pnpm**, not npm or yarn. `package-lock.json` was replaced by
  `pnpm-lock.yaml`, so commit lockfile changes alongside any dependency change.
- Keep frontend and backend dependencies self-contained; do not add internal
  workspace packages for application code.
- Commit infrastructure changes with the phase they belong to, and prefer adding
  a healthcheck to any new Compose service.
- Never commit `node_modules/`, `dist/`, `.next/`, or `.env` files.
- Handle money as integer paise, never floating point.
