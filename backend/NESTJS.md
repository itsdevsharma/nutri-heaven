# How the NestJS API works

This document explains the API in `backend` the way it actually runs — every
claim traces to a file you can open. It assumes basic TypeScript, not NestJS.

## 1. The one idea: NestJS is a module tree with injected dependencies

NestJS applications are a tree of **modules**. Each module declares three
things — **controllers** (HTTP endpoints), **providers** (business logic
classes), and **imports** (other modules whose providers it needs). At startup
NestJS walks the tree from the root module, creates one shared instance of
every provider (**dependency injection**, §5), wires them together, then maps
controller methods to Express routes. There is no manual `new` and no manual
route registration anywhere in this codebase.

```
main.ts → AppModule (root)
├── ConfigModule        (reads .env — global, so every module sees it)
├── MongooseModule      (one MongoDB connection for the whole process)
└── ProductsModule      (the only feature module so far)
    ├── ProductsController  (GET /products, GET /products/:slug, POST /products/quote)
    └── ProductsService     (queries MongoDB, applies the shared pricing rule)
```

## 2. Startup: `main.ts` → `AppModule`

`src/main.ts` is the process entry point (`package.json` → `nest start`
compiles `src/main.ts` to `dist/main.js`, and `pnpm start` runs
`node dist/main.js`):

1. `NestFactory.create(AppModule)` builds the module tree and instantiates
   every provider. Nothing serves traffic yet.
2. `app.useGlobalPipes(new ValidationPipe({ whitelist, forbidNonWhitelisted,
   transform }))` installs request validation for **every** route (§4).
3. `app.enableCors({ origin })` allows the storefront
   (`http://localhost:5173` by default, overridable via `CORS_ORIGINS`) to
   call the API from a browser.
4. `app.listen(port)` binds Express. `API_PORT` defaults to `3000`.

`src/app.module.ts` is the root of the tree. Its `@Module()` decorator lists
`imports: [ConfigModule, MongooseModule, ProductsModule]` and
`controllers: [HealthController]`. Concretely:

- `ConfigModule.forRoot({ isGlobal: true })` loads `.env` from the repository
  root into `process.env`. "Global" means feature modules never import it
  again — `process.env.MONGODB_URI` just works everywhere.
- `MongooseModule.forRootAsync(...)` opens **one** MongoDB connection,
  defaulting to
  `mongodb://localhost:27017/nutri_heaven?directConnection=true` so the
  stack boots with no `.env` at all. **Why the `Async` variant:** its factory
  runs when NestJS instantiates the module, so `MONGODB_URI` is read lazily.
  With plain `forRoot` the URI would freeze at import time — before the e2e
  suite's `beforeAll` sets it — and the tests would seed the **Docker**
  database instead of the in-memory one (E11000 duplicate-key failures; see
  §9 and the Appendix).
  `?directConnection=true` tells the driver to talk to our single node
  directly instead of discovering a replica-set topology (correct for a
  one-node development set; production Atlas URIs carry their own topology
  and ignore it).
- `ProductsModule` is imported so its controller's routes exist.
## 3. A request's journey (example: `GET /products/almonds`)

1. **Express → controller.** `ProductsController` is decorated
   `@Controller('products')`, so every method's path is prefixed with
   `/products`. `@Get(':slug')` maps `GET /products/almonds` to `bySlug()`
   with `slug = 'almonds'`. (Route order matters: `@Post('quote')` is
   declared *before* `@Get(':slug')`, otherwise Express would read `quote`
   as a slug and return 404 — see the comment in `products.controller.ts`.)
2. **Validation.** Before the method runs, the global `ValidationPipe`
   validates params/body against DTO classes (see §4).
3. **Controller → service.** The controller holds no business logic; it
   delegates to `ProductsService`, which NestJS injected through the
   constructor (`constructor(private readonly products: ProductsService)`).
4. **Service → MongoDB.** The service queries the `products` collection
   through the injected Mongoose model
   (`@InjectModel(Product.name) private readonly products`). `findBySlug()`
   throws `NotFoundException` when nothing matches — NestJS translates that
   into a `404` JSON response automatically, no `try/catch` in the
   controller.
5. **Response.** The returned object is serialized to JSON. Mongoose's
   `.lean()` (used in every query) returns plain objects instead of Mongoose
   document instances — faster, and safe to serialize.

## 4. Validation: DTOs + `class-validator`

DTOs are classes in `src/products/dto/` whose decorators declare the shape
of incoming data:

- `ListProductsQuery` — `GET /products?limit=10&offset=0`. Query strings
  always arrive as strings, so `@Type(() => Number)` coerces them first
  (enabled by `transform: true`), then `@IsInt() @Min(1) @Max(100)` rejects
  nonsense. Defaults (`limit = 50`) apply when the parameter is absent —
  which is also why the decorators carry `@IsOptional()`.
- `QuoteRequest` — `POST /products/quote` body. `lines` must be a 1–50
  element array of `{ slug, quantity }` objects (`@ValidateNested` +
  `@Type(() => QuoteLine)`), quantities are integers 1–99, and the optional
  `pin` must match `/^\d{6}$/` when present. `@IsOptional()` on `pin` is
  load-bearing: without it, omitting `pin` fails validation (this exact bug
  was caught by live-testing the endpoint, not by reading the docs).

Two pipe flags do the security work: `whitelist: true` strips unknown
properties, and `forbidNonWhitelisted: true` upgrades that to a `400`
rejection — a client cannot smuggle extra fields into a DTO.

## 5. Dependency injection, concretely

When `ProductsService` declares
`constructor(@InjectModel(Product.name) private readonly products)`, NestJS
reads the **emitted decorator metadata** (this is why
`experimentalDecorators` + `emitDecoratorMetadata` are set in
`backend/tsconfig.json` — without them the container cannot see
constructor types and injection silently breaks) and supplies the Mongoose
model registered by
`MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }])`
in `ProductsModule`. One model instance is shared process-wide (singleton
scope). Testing exploits the same mechanism: the e2e spec builds the real
`AppModule` with `Test.createTestingModule`, and because `forRootAsync` reads
`MONGODB_URI` lazily, `@InjectModel` resolves to a model pointed at the
in-memory server (set in `beforeAll`) instead of Docker MongoDB.

## 6. The data layer: Mongoose schema → MongoDB collection

`src/products/product.schema.ts` defines the `Product` class with `@Schema()`
/ `@Prop()` decorators, and `SchemaFactory.createForClass(Product)` derives
the Mongoose schema from it — one class is both the TypeScript type and the
database schema, so they cannot drift apart. Key choices:

- **Money is integer paise.** `pricePaise: 27500` means Rs 275. Floating
  rupees accumulate binary rounding error; integers never do. Formatting back
  to rupees happens at the boundary only. This matches the repo rule in
  `CONTRIBUTING`.
- **`slug` is the stable public id** (`almonds`, `cashews`, …) with a unique
  index, deliberately identical to the ids hardcoded in `frontend/src/App.jsx`
  so phase 3 can swap the storefront to API data without remapping.
- **`timestamps: true`** adds `createdAt`/`updatedAt` automatically.
- **`isActive`** supports soft-hiding products: list and detail queries
  filter `{ isActive: true }`, so deactivated products 404 without deleting
  data.

Development MongoDB is a **single-node replica set** (`--replSet rs0` in
`docker-compose.yml`), not a standalone server, because multi-document
transactions only exist on replica sets — developing against a standalone
would hide transaction errors until production. The `healthcheck` initiates
the set on first boot and reports healthy only once this node is the writable
primary, so `pnpm infra:up --wait` returns only when MongoDB accepts writes.

## 7. Server-side pricing: `POST /products/quote`

The quote endpoint exists because **prices must never be trusted from the
client**. The storefront totals its cart in the browser today (see README
"Pricing"), so a tampered client could invent any total. The fix:

1. The client sends **slugs + quantities only** — no prices.
2. The service loads every slug from MongoDB in one `$in` query, so N cart
   lines cost 1 query.
3. Unknown slugs 404; quantities were already range-checked by the DTO.
4. The shipping rule comes from `src/common/pricing.ts`, the backend's
   authoritative definition.
5. The response carries `lines[]` (with per-line `unitPricePaise` from the
   database), `subtotalPaise`, `shippingPaise`, `totalPaise`.

Phase 3 builds order creation on this pattern: re-price from the database
inside a transaction, then decrement stock.

## 8. Seeding: `src/seed.ts` + `pnpm backend:seed`

`seed.ts` boots the real `AppModule` as a headless application context
(`NestFactory.createApplicationContext` — no HTTP port), then upserts the 8
storefront products by slug (`updateOne(..., { upsert: true })`). Upsert
means re-running is safe: matching slugs update in place, new ones insert,
nothing duplicates. Run it with `pnpm backend:seed` after `pnpm infra:up`;
verify with `GET /products` (expect 8 entries).

## 9. Testing: real HTTP against in-memory MongoDB

`test/products.e2e-spec.ts` (run with `pnpm backend:test`) boots the **real**
`AppModule` via `Test.createTestingModule` with `MONGODB_URI` pointed at a
`mongodb-memory-server` standalone — no Docker needed for tests. (Standalone
rather than replica set deliberately: the memory server's own replica-set
setup handshake fails against current MongoDB binaries with
`ClientMetadataMissingField: driver`, while Docker's `mongo:7.0` replica set
works fine — and nothing under test opens a transaction. Phase 3 revisits
this when order transactions arrive.) Supertest drives real HTTP against the
in-memory app and asserts:

- `GET /health` returns `{ status: 'ok' }`
- `GET /products` lists seeded products; `GET /products/:slug` returns one
  and 404s unknown slugs
- `POST /products/quote` computes `2 x Rs 275 = Rs 550 + Rs 79 shipping =
  Rs 629` from database prices, ships free over Rs 999, and rejects empty
  carts (400) and unknown slugs (404)

`mongodb-memory-server` downloads a MongoDB binary (~100 MB) on first run
and needs its postinstall script approved once per machine
(`pnpm approve-builds mongodb-memory-server`) — pnpm blocks install scripts
by default as supply-chain protection.

## 10. Where to look next

| Question | File |
| --- | --- |
| How does the process start? | `src/main.ts` |
| What modules exist? | `src/app.module.ts`, `src/products/products.module.ts` |
| What endpoints exist? | `src/products/products.controller.ts`, `src/health.controller.ts` |
| What does the client send? | `src/products/dto/` |
| How is pricing computed? | `src/products/products.service.ts` |
| What is stored? | `src/products/product.schema.ts` |
| Where do the 8 products come from? | `src/seed.ts` |
| How is it tested? | `test/products.e2e-spec.ts` |
| Pricing rule? | `src/common/pricing.ts` |
| Compiler flags for DI? | `tsconfig.json` |

## Appendix: two real bugs found while building this phase

Both were caught by running the code, not by reading docs:

1. **Optional `pin` rejected when omitted** (`quote.request.ts`): the field had
   `@Matches()` without `@IsOptional()`, so a body with no `pin` failed
   validation. A live `curl` against the running API exposed it; `@IsOptional()`
   fixed it.
2. **E2E suite seeded the Docker database** (`app.module.ts`): with
   `MongooseModule.forRoot(...)`, the URI froze at import time — before the
   test's `beforeAll` set `MONGODB_URI` — so the suite wrote into the 8 seeded
   Docker products and died on E11000 duplicate keys. `forRootAsync` reads the
   URI lazily at instantiation time and fixed it (see §2).
