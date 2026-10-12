    # Website completion plan and audit checklist

Started: 2026-10-12. Scope: remaining customer, commerce, operations and release work.

Status rules: IMPLEMENTED means code exists; VERIFIED means automated/manual evidence is recorded; EXTERNAL means a credential, production deployment or owner decision is still needed. Never mark external checks complete from local tests.

## Sequence

- [x] 1. Password recovery: delivery adapter, expiring single-use link, reset form, throttling, session revocation.
- [x] 2. Customer profile and addresses: edit profile; add/edit/delete/default addresses; ownership checks.
- [x] 3. Wishlist: add/remove from product screens and account; signed-out handling.
- [x] 4. Catalogue pagination: load every product without the 50-product truncation; search/filter correctness.
- [x] 5. Durable notifications: per-customer inbox, read state, welcome/sign-in/order events; transactional email queue.
- [x] 6. Customer orders: details, timeline, tracking, cancel/return requests, ownership/state checks.
- [x] 7. Newsletter: consent, persistence, confirmation, unsubscribe, admin visibility.
- [x] 8. Catalogue quality report and editor links implemented. Actual content replacement remains OPEN pending owner-supplied images/copy.
- [x] 9. Sales reports: paid revenue, daily trends, top products, customer counts; explicit definitions.
- [x] 10. Reviews: verified delivered purchase, validation, pending moderation, approved public output.
- [x] 11. Order receipt implemented; tax invoice pending seller/tax details; shipping integration deferred by user. Original scope: printable/downloadable order document, courier adapter, admin booking/tracking.
- [x] 12. Local release audit implemented and executed; external checks remain open below. Scope: builds, regression suite, mobile checks, environment checklist, deployment smoke tests.

## Acceptance gates for each phase

- Validate input and permissions server-side; reject cross-customer access.
- No password/reset secrets in ordinary API responses, logs or audit events.
- Loading, success, empty and failure states; keyboard labels and mobile layout.
- Retry-safe writes where needed; no payment or stock changes outside existing commerce services.
- Test normal, invalid, unauthorized and unavailable-service paths.
- Record actual verification and outstanding limitations below.

## External release checklist

- [ ] Confirm verified email sender and configure provider credentials.
- [ ] DEFERRED BY USER: courier provider, pickup location and parcel dimensions/weight.
- [ ] Confirm seller/tax information before issuing tax invoices.
- [ ] Review flagged catalogue content with real product images/descriptions.
- [ ] Deploy backend and frontend; verify public API origin, CORS and HTTPS.
- [ ] Verify real reset-email delivery and unsubscribe from a test inbox.
- [ ] Verify Razorpay capture/webhook/refund with merchant-approved test transactions.
- [ ] DEFERRED BY USER: courier booking/provider tracking validation. Manual tracking links are implemented.
- [ ] Verify production SEO, robots, sitemap and account flows.

## Evidence and implementation notes

## Implemented and locally verified

- Resend adapter uses a verified sender via server-only environment variables; reset tokens are single-use (atomic consumption), expire in 15 minutes, and revoke existing sessions. Reset requests are throttled per email within each API process. Actual inbox delivery needs credentials.
- Profile/address CRUD, default address, saved-address checkout, wishlist controls, and removal UI.
- Server-side catalogue search, category descendants, price sorting, and 24-item pages; validated beyond 50 records.
- Durable customer inbox with read state and queued welcome/order emails. Worker runs in the backend every 30 seconds with up to five retries; requires a continuously running backend. Sign-in notifications are stored in the inbox. Newsletter uses explicit consent, expiring confirmation and unsubscribe tokens.
- Customer order timeline, safe tracking links, cancellation, delivered-order return request, and escaped downloadable HTML receipt (print/save PDF). Receipt is explicitly not a tax invoice.
- Signed-in checkout binds customer ID; customers cannot access another account's orders, receipts or verified-purchase review eligibility through a guessed email. Guest/legacy orders require a future verified claim/migration workflow; they are not automatically claimed by email.
- Super-admin sales report (paid amounts after discount including delivery, excluding cancelled/returned/refunded), daily India-time totals, top product units/gross amounts, pending email count, subscribers and review moderation.
- Published-product quality report flags missing/placeholder content with links to the editor. Correct product photography and copy require owner review; no invented content was applied.
- Reviews require a delivered purchase and remain private until approved. One review per customer/product; backend validation and public-field projection.
- Existing server-backed checkout and Razorpay paths were retained. Full refund supports paid cancelled orders as well as returned orders. Live gateway verification is still external.

## Verification evidence

- Backend and frontend builds: PASS.
- `backend/test/website-completion.e2e-spec.ts`: isolated disposable replica set, eight integration scenarios PASS.
- `backend/test/website-completion.browser.cjs`: real HTTP API + disposable Mongo + Chromium PASS for signup, profile, address, pagination, search, wishlist, password reset, newsletter confirmation and admin insights. COD checkout persisted a real order, associated customer ID and reduced stock 20 → 19.
- Replica-set test helper uses native Node outside Jest VM to avoid MongoDB 7 driver/BSON metadata incompatibility. No production dependencies were changed.
- Full regression results and external limitations are maintained in `audit-reports/08-test-execution-report.md` and `audit-reports/10-final-readiness-report.md`.

## Reproduction

```sh
npm run build --prefix backend
npm run build --prefix frontend
npm test --prefix backend -- --runInBand
npm run test:seo --prefix frontend
npm run test:payments --prefix frontend
# Start Vite on port 5173. Install Playwright in your test environment, or point
# PLAYWRIGHT_MODULE at an existing installation. The script starts an isolated
# API on 3101 and disposes its Mongo database and server afterwards.
node backend/test/website-completion.browser.cjs
# Read-only post-deploy checks:
SMOKE_SITE_URL=https://YOUR-SITE SMOKE_API_URL=https://YOUR-API npm run audit:deployment --prefix frontend
```

The existing inventory/payment suites use dedicated disposable databases on the local replica set; see their TEST_MONGODB_URI / PAYMENTS_TEST_MONGODB_URI settings. Never point tests at production.

Provider documentation consulted: https://resend.com/docs/api-reference/emails/send-email and https://resend.com/docs/dashboard/emails/idempotency-keys.

Existing unrelated working-tree changes are preserved.

## External release follow-up — 2026-10-12

Production probes: `nutri-heaven-mu.vercel.app` home/shop/sitemap return 503; the older `nutri-heaven-topaz.vercel.app` returns 404. HTTPS responds but release gates remain open. See [external verification](../../audit-reports/11-external-release-verification.md). Smoke tooling now checks CORS GET/preflight and HTTPS redirect downgrade; production API origin and provider access remain pending.
