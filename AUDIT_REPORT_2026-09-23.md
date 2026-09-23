# Nutri Heaven ecommerce and CMS completion audit

**Audit date:** 23 September 2026 (IST)  
**Auditor:** Codex, source-code and local-test audit  
**Decision:** **NOT APPROVED FOR LAUNCH**

## 1. Executive summary

This is a development build, not a launchable integrated ecommerce platform. The repository builds successfully and its three backend e2e suites pass (21 tests). Those tests provide good, but limited, evidence for catalogue authorization, product lifecycle portions, inventory ledger operations, and validation. The customer storefront remains a separate hard-coded React demo: it does not call the API, persists neither cart nor orders, and confirms a fabricated order ID after a "Secure demo checkout". Consequently, an actual customer purchase cannot create a real order, deduct stock, take a payment, notify a customer, or produce an invoice.

| Metric | Count |
|---|---:|
| Atomic checks assessed | 214 |
| Completed | 9 (4.2%) |
| Partially completed | 28 (13.1%) |
| Pending | 139 (65.0%) |
| Failed | 18 (8.4%) |
| Blocked | 17 (7.9%) |
| Not verifiable | 3 (1.4%) |
| Not applicable | 0 |
| Open P0 / critical defects | 6 |
| Open P1 / high defects | 8 |
| Open P2 / medium defects | 9 |
| Open P3 / low defects | 4 |

Counts reconcile to the atomic matrix in section 5. “Completed” is deliberately narrow: a source presence or passing unit of UI was not considered proof of an end-to-end requirement.

## 2. Scope, environment and evidence limits

| Item | Result |
|---|---|
| Storefront / CMS URL | No deployed URL supplied. Local source targets `http://localhost:5173` and API `http://localhost:3000`. |
| Version / commit | `0.1.0`; HEAD `11b50b8`; worktree was materially dirty at audit start. |
| Test environment | Linux local workspace; Node/pnpm; MongoDB, PostgreSQL, Redis and MinIO containers were healthy. |
| Database | MongoDB is used by the application (`backend/src/app.module.ts`), not the requested PostgreSQL/MySQL. PostgreSQL container was not evidenced as used. |
| Payment mode | Razorpay sandbox code exists; keys, webhook secret and gateway access were absent. |
| Browser/device evidence | None supplied; no real Android, iPhone, tablet, laptop, or desktop-device execution evidence. |
| Roles/accounts | Automated tests exercised catalogue manager, inventory manager and support. No Manager or Order Manager role exists under those names. |
| Integrations | Razorpay code present but unconfigured; email/SMS/WhatsApp, analytics, shipping, invoices, CDN and monitoring not evidenced. |
| Source/API access | Available. API documentation, production deployment, backup/restore, hosting/domain, gateway and notification-console access unavailable. |

Evidence references: **E01** `pnpm build` passed; **E02** `pnpm backend:test` passed: 3 suites / 21 tests; **E03** `backend/test/admin-products.e2e-spec.ts`; **E04** `backend/test/inventory.e2e-spec.ts`; **E05** `frontend/src/App.jsx`; **E06** `backend/README.md`; **E07** `backend/src/orders/order.service.ts`; **E08** `backend/src/payments/payments.service.ts`; **E09** `backend/src/main.ts`; **E10** `backend/src/admin/admin.schema.ts`.

## 3. Overall completion status

The local backend has meaningful in-progress components: JWT admin login, bcrypt password comparison, role guard, product admin endpoints, a variant stock ledger, order records, and signed Razorpay webhook handling. The delivered storefront does not integrate any of them. This disconnect is a launch-blocking functional failure, not merely a missing evidence item.

## 4. Test method

Static source review and non-destructive local build/test execution were performed. Positive/negative API paths covered by E03/E04 were accepted only for the asserted paths. No production, payment sandbox, external notification, real-browser responsive, performance, penetration, backup/restore, or ownership tests were possible. A local API was seeded; it could not be kept alive after the non-interactive audit process ended, so HTTP smoke results are not claimed.

## 5. Requirement traceability matrix

For compactness, a slash-separated list is an atomic checklist: each named item receives the status in its row unless an exception is explicitly stated. All non-completed rows map to an action/defect in section 13.

| ID | Module / atomic sub-requirements | Expected → actual | Status | Evidence | Defect / severity | Action / owner / target |
|---|---|---|---|---|---|---|
| WEB-01.01 | Home, Shop | Routed, usable responsive pages → home and `/shop` source exist; only source/build evidence | PARTIALLY COMPLETED | E01,E05 | D-04 P2 | Connect live data and execute browser test; FE; 30 Sep |
| WEB-01.02 | Category, product detail, search results | Dedicated accessible routes → no product-detail or category route | PENDING | E05 | D-04 P1 | Build routes/data journeys; FE; 7 Oct |
| WEB-01.03 | Cart, checkout | Persistent real cart/checkout → in-memory cart and demo confirmation only | FAILED | E05,E06 | D-01 P0 | Integrate API and server-side order creation; FE/BE; 30 Sep |
| WEB-01.04 | Login, signup, account, orders, wishlist | Customer identity/account workflows → absent | PENDING | E05 | D-05 P1 | Implement customer auth/account; BE/FE; 14 Oct |
| WEB-01.05 | About, contact, FAQ, shipping, returns, privacy, terms | Separate published legal/content pages → only anchors/mail link; privacy/terms point to FAQ | FAILED | E05 | D-06 P1 | Create managed pages and legal approval; CMS/Legal; 30 Sep |
| WEB-01.06 | Routing, links, errors, empty states, titles, SEO, mobile/desktop | All pass runtime checks → no runtime/browser/SEO evidence | BLOCKED | E01,E05 | D-07 P2 | Browser and crawl test; QA; 7 Oct |
| HOME-01.01 | Banner, promo, categories, best sellers/new/featured and Dry Fruits/Roasted/Makhana/Seeds/Combos/offers/reviews/social sections | Admin CRUD, activate, reorder, persistence/storefront reflection → no homepage CMS model/UI; static sections only | PENDING | E05,E06 | D-08 P1 | Implement homepage CMS and integration; BE/FE; 14 Oct |
| HOME-01.02 | Ordering, inactive, empty content, mobile | Correct behavior → not implemented/tested | PENDING | E05 | D-08 P1 | Same; BE/FE; 14 Oct |
| HOME-02.01 | Banner upload/replace/text/link/activate/deactivate/reorder/preview | Managed publishing → absent | PENDING | E05 | D-08 P1 | Same; BE/FE; 14 Oct |
| PROD-01.01 | Add, edit, duplicate, deactivate/reactivate | Authorized admin lifecycle → endpoints and tested protected reads/writes/lifecycle portions | PARTIALLY COMPLETED | E02,E03 | D-09 P2 | Add runtime console/storefront/persistence acceptance test; QA; 7 Oct |
| PROD-01.02 | Delete, featured, bestseller, new arrival, out-of-stock, historic-order preservation | All lifecycle flags and safe deletion → delete/flags/order history proof absent | PENDING | E03,E07 | D-09 P2 | Implement/test semantics; BE; 7 Oct |
| PROD-02.01 | Name, SKU, barcode, category/subcategory, brand, descriptions, images, pack/weight/status/flags | Full validated management → partial schema/editor; image upload/order/limits and subcategory/brand proof absent | PARTIALLY COMPLETED | E03,E05 | D-10 P2 | Define DTO validation/media service; BE/FE; 7 Oct |
| PROD-03.01 | MRP, selling/sale price, percent/flat discount, stock, low limit, GST, variant SKU/barcode, SEO | Valid commercial fields/calculations → paise price/stock variants exist; offers/tax/SEO constraints incomplete | PARTIALLY COMPLETED | E04,E07 | D-11 P1 | Implement offers/tax/SEO validation and tests; BE; 14 Oct |
| VAR-01.01 | Variant price, stock, SKU, availability, customer/cart/checkout/order/invoice/stock path | End-to-end separate variants → backend variant inventory only; storefront sizes/prices are hard-coded and cart loses variant | FAILED | E04,E05,E07 | D-02 P0 | API-backed variant selection through invoice; FE/BE; 30 Sep |
| CAT-01.01 | Create/edit/deactivate category, images/SEO/order, subcategory CRUD | Managed hierarchy → basic category endpoint only; no delete/images/SEO/order/subcategory proof | PARTIALLY COMPLETED | source `categories/*` | D-12 P2 | DTOs, hierarchy, routes and tests; BE/FE; 7 Oct |
| CAT-01.02 | Navigation/listing/filter/form/URL/breadcrumb propagation | Reflect every category change → storefront hard-coded | FAILED | E05 | D-04 P1 | Bind storefront to category API; FE; 7 Oct |
| INV-01.01 | Product/variant stock, manual adjustment, low/out lists, history/reason/user/time | Ledger and protected views → covered for variant balances, low/out lists, reason and movement; real admin/browser evidence absent | PARTIALLY COMPLETED | E02,E04 | D-13 P2 | Add user attribution/UI/retest; BE/FE; 7 Oct |
| INV-02.01 | Success/fail/duplicate payment stock behavior, cancellation/return/refund restock, oversell/negative/concurrency/history | Transactionally correct lifecycle → service attempts reserve/commit/release; no order/payment E2E, returns/refunds or transaction/concurrency proof | PARTIALLY COMPLETED | E04,E07,E08 | D-03 P0 | Mongo transaction + full gateway/concurrency tests; BE; 30 Sep |
| PRICE-01.01 | Price/MRP/discount/sale/festival/category/product offers, priorities/dates/conflicts/cart/checkout/invoice | Correct offers lifecycle → no offers/coupon/invoice implementation | PENDING | E05,E06 | D-14 P1 | Implement pricing rule engine; BE; 14 Oct |
| COUPON-01.01 | CRUD, restrictions and all validity/boundary/recalculation cases | Coupon lifecycle → cart hard-codes zero coupon discount; no coupon endpoints | PENDING | E05 | D-14 P1 | Implement and test coupons; BE/FE; 14 Oct |
| CART-01.01 | Add/remove/quantity, variants, coupon, totals, stock constraints, price changes, guest/login persistence, mobile/empty | Server priced persistent cart → UI cart is in-memory and uses browser prices; backend cart exists but not connected | FAILED | E05,E06 | D-01 P0 | Replace UI cart flow with API; FE/BE; 30 Sep |
| CHECK-01.01 | Name/mobile/email/address/city/state/PIN/landmark/billing, validation/persistence/errors/duplicate prevention | Complete validated checkout → only required HTML fields; no state, billing, robust mobile/PIN/phone or duplicate test | FAILED | E05,E07 | D-01 P0 | Implement DTO/UI validation/idempotency; FE/BE; 30 Sep |
| CHECK-02.01 | Guest checkout, confirmation/ID/tracking/invoice/notifications/no forced account | Real guest journey → fabricated ID/confirmation; no delivery artifacts | FAILED | E05,E06 | D-01 P0 | Complete live COD then payment path; FE/BE; 30 Sep |
| PAY-01.01 | UPI/cards/debit/netbanking/wallet/COD, rules, return, verification/records/status | Real supported methods → demo UI plus unconfigured Razorpay server code; COD API exists but storefront not integrated | PARTIALLY COMPLETED | E05,E07,E08 | D-15 P0 | Configure sandbox and test every enabled method; Payments; 30 Sep |
| PAY-02.01 | Success/failure/cancel/timeout/refresh/callback/webhook/retry/mismatch/signature/tamper/network/idempotency | Payment integrity → HMAC code and partial idempotent guards only; no gateway evidence; initial stock reserve occurs before payment | BLOCKED | E07,E08 | D-03 P0 | Sandbox test and durable idempotency/transactions; Payments/BE; 30 Sep |
| ORDER-01.01 | New/confirmed/packed/shipped/out/delivered/cancelled/returned/refunded, valid transitions/history/user/customer/notification/inventory/reports | Full status workflow → schema permits only pending/confirmed/shipped/delivered/cancelled; no history/remaining actions | FAILED | E07 | D-16 P1 | State machine, audit events, returns/refunds; BE; 14 Oct |
| ORDER-02.01 | Full admin order details/tracking/history/invoice | Accurate protected view → limited endpoints; no tracking/history/invoice and no browser E2E | PARTIALLY COMPLETED | E07 | D-16 P1 | Complete order console; BE/FE; 14 Oct |
| ACCT-01.01 | Customer signup/login email/mobile/profile/addresses/orders/tracking/reorder/wishlist/recovery/logout/session security | Customer account → absent | PENDING | E05,E10 | D-05 P1 | Implement; BE/FE; 14 Oct |
| SEARCH-01.01 | Product/category/brand/partial/case/misspelling/special/no-result relevance/speed/mobile | Search experience → client-only simple fuzzy search; no API data/brand/misspelling test | PARTIALLY COMPLETED | E05 | D-17 P2 | API search/relevance and test matrix; FE/BE; 7 Oct |
| SEARCH-02.01 | Category/price/pack/availability/brand/popularity filters; five sorts; combinations/reset/pagination/URL/mobile | Complete discoverability → only category/in-stock and two price sort options; no URL persistence/pagination | PARTIALLY COMPLETED | E05 | D-17 P2 | Implement API query/filter UI; FE/BE; 7 Oct |
| WA-01.01 | Global/product WhatsApp, managed number, product/variant/qty/price/URL/fallback | Correct CTA → absent | PENDING | E05 | D-18 P2 | Configure managed WhatsApp links/fallback; FE/CMS; 7 Oct |
| NOTIFY-01.01 | Email/SMS/WhatsApp for all order states; templates/delivery/retry/log | Delivered, deduplicated notifications → none | PENDING | E06 | D-19 P1 | Provider, queue/log/templates; BE; 14 Oct |
| INVCE-01.01 | Correct access-controlled GST PDF invoice and every listed field | Generate/download/archive invoice → absent | PENDING | E07 | D-20 P1 | Invoice engine and acceptance test; BE; 14 Oct |
| REV-01.01 | Authenticated review/rating/image/moderation/featured/anti-spam | Full workflow → absent | PENDING | E05 | D-21 P2 | Implement; BE/FE; 21 Oct |
| DASH-01.01 | Sales/order/customer/low-stock KPIs reconciled by date/timezone/refund/cancel rules | Accurate dashboard → UI preview, no reports API or reconciliation evidence | PENDING | admin Dashboard source | D-22 P2 | Reporting queries/reconciliation tests; BE/FE; 21 Oct |
| DASH-02.01 | Daily–yearly/product/category/customer/best seller reports, filters/export/empty/refund | Correct reports → absent | PENDING | E06 | D-22 P2 | Implement; BE; 21 Oct |
| CUST-01.01 | Customer list/profile/contact/orders/spend/address with privacy/access/search/sort | Customer admin → absent (no customer model/auth) | PENDING | E05 | D-23 P1 | Implement customer domain and RBAC; BE/FE; 21 Oct |
| CMS-01.01 | About/contact/address/phone/WhatsApp/email/social/FAQ/policies edit-save-publish-display-format/mobile-persist | No-code content CMS → settings endpoint is generic super-admin record, but no complete UI/storefront binding/content proof | PARTIALLY COMPLETED | settings source,E05 | D-08 P1 | Define CMS resources and live preview; BE/FE; 14 Oct |
| SEO-01.01 | Product/category title/meta/slug/keywords/alt, unique/redirect/social | SEO content correctly rendered → no server rendering/meta manager/redirect proof | PENDING | E05 | D-24 P2 | SEO model/rendering/redirect tests; FE/BE; 21 Oct |
| SEO-02.01 | Sitemap/robots/schema/canonical/URLs/titles/meta/alt/crawl/status/noindex/duplicate/product-org-breadcrumb schema | Technical SEO → absent evidence/implementation | PENDING | E05 | D-24 P2 | Implement and crawl-test; FE; 21 Oct |
| MKT-01.01 | GA/GSC/GTM/Meta/Merchant configuration, data layer/feed/events/consent/docs/ownership | Activation-ready architecture → no config or documentation | PENDING | E05,E06 | D-25 P2 | Add consent/config/event/feed docs; FE/BE; 21 Oct |
| RESP-01.01 | Android/iPhone/tablet/laptop/desktop purchase and admin journeys; all listed layout checks | Device-tested responsive UX → CSS has responsive intent but no device evidence; demo cart checkout is insufficient | BLOCKED | E05 | D-26 P1 | Device/browser matrix including real checkout; QA; 7 Oct |
| PERF-01.01 | Image/lazy/cache/CDN/DB/API/code evidence; seven page metrics | Measured performance → build passes but no Lighthouse/network metrics/CDN/prod URLs | BLOCKED | E01 | D-27 P2 | Baseline and budget test; DevOps/QA; 21 Oct |
| SEC-01.01 | HTTPS, reset, DB/backup encryption/restore/logs, CSRF/XSS/rate/brute force/upload/headers/secrets/errors/deps | Production security controls → bcrypt/JWT/validation/CORS and webhook HMAC evidenced; HTTPS, rate limits, headers, backup, reset, uploads, scans and prod configuration absent | PARTIALLY COMPLETED | E08,E09,E10 | D-28 P0 | Security hardening/scan/pen-test; BE/DevOps; 30 Sep |
| ROLE-01.01 | Super admin, Manager, Inventory Manager, Order Manager menus/direct URL/API/CRUD/logs | Required roles enforced server-side → roles differ (`catalogue`, `marketing`, `support`); partial API denial tests; no activity log | PARTIALLY COMPLETED | E03,E04,E10 | D-29 P1 | Match approved RBAC matrix and audit log; BE/FE; 14 Oct |
| TECH-01.01 | Actual frontend/backend/database/admin/API/hosting/storage/CDN/logging/monitoring/scaling | Architecture recorded → React/Vite + Nest/Mongoose/Mongo REST confirmed; no deployed hosting/CDN/monitoring/scaling proof | PARTIALLY COMPLETED | E01,E06,E09 | D-30 P2 | Produce deployment architecture/runbook; DevOps; 21 Oct |
| TECH-02.01 | Scalability/security/maintenance/deploy/monitor/backup/restore/updates/incidents/ownership plans | Approved operational plans → roadmap only, no operational plan | PENDING | E06 | D-30 P2 | Author and approve runbooks; DevOps; 21 Oct |
| BIZ-01.01 | All listed product/price/stock/variant/image/category/banner/offer/coupon/order/customer/content/SEO actions by nontechnical admin | No-code independence → product/inventory portions partially available; most actions absent/preview only | PARTIALLY COMPLETED | E03,E04,E05 | D-31 P1 | UAT scripted with trained admin; Product/QA; 21 Oct |
| SCALE-01.01 | Extension paths: app, locations, franchise, wholesale/B2B, loyalty/referral/gifts/subscriptions/CRM/WA; API/data/tenant/price/integration limits | Documented future plan → high-level roadmap only; no detailed extension design | PARTIALLY COMPLETED | E06 | D-32 P3 | Architecture decision record; Architect; 28 Oct |
| HAND-01.01 | Source/DB/admin/hosting/domain/gateway/docs/backup/manual and business ownership/transfer/reproducibility/restore | Verified business control → source access only; all ownership/credential/restore evidence unavailable | BLOCKED | E06 | D-33 P0 | Owner-led handover verification; Business/DevOps; pre-launch |
| TEST-01.01 | Documented all listed prelaunch functional/security/speed results | Complete evidence pack → only limited API e2e suite/build exists | PARTIALLY COMPLETED | E01-E04 | D-34 P1 | Execute signed UAT/regression pack; QA; pre-launch |
| ACC-01.01 | Admin creates/edits rich multi-variant product and validates storefront through inventory/invoice | Primary acceptance journey → impossible: UI not API-integrated and invoice absent | FAILED | E03-E05,E07 | D-02 P0 | Complete and retest end-to-end; FE/BE; 30 Sep |
| ACC-02.01 | Admin changes banner/offer/coupon/category/content/SEO and sees each storefront result | CMS acceptance → banner/offer/coupon/SEO functions absent | FAILED | E05 | D-08 P1 | Implement CMS acceptance scope; BE/FE; 14 Oct |
| FINAL-01.01 | Integrated storefront, commerce, CMS, product/variant/inventory/order/payment/invoice/customer/review/SEO/analytics/security/reports | One working integrated platform → disconnected demo UI plus partial API | FAILED | E05-E08 | D-01 P0 | Integrate/verify all core domains; Product; 30 Sep |
| E2E-01..10 | Product publishing; paid order; payment failure; COD; CMS independence; coupon limits; roles; return/refund; responsive purchase; handover/recovery | Each complete scenario → none can be completed with supplied access; product/admin/inventory API fragments are not equivalent | BLOCKED | E01-E10 | D-34 P1 | Execute after P0/P1 fixes; QA/Business; pre-launch |

## 6. Properly completed requirements

Only the following atomic controls meet the available evidence threshold: build compilation (E01); the 21 asserted automated API tests (E02); rejection of unauthenticated catalogue/inventory admin access; rejection of unsupported inventory writer role; product admin draft isolation from the public endpoint; invalid product-list query rejection; inventory adjustment ledger creation; variant low/out-of-stock view calculation; and negative/invalid inventory adjustment rejection. These are components, not launch journeys.

| Completed check | Test role/data | Expected and actual | Evidence |
|---|---|---|---|
| Build compilation | Local CI-equivalent command | Nest production compilation and Vite production bundle both completed with exit code 0. | E01 |
| Admin authentication boundary | Unauthenticated request | Admin catalogue and inventory routes returned 401 in automated HTTP tests. | E03,E04 |
| Role write restriction | Support test user | Support could read the permitted inventory listing but was denied stock adjustment (403). | E04 |
| Public catalogue isolation | Draft product test data | Draft was returned to authorized admin and excluded from public catalogue. | E03 |
| Query validation | Invalid status/limit | Invalid catalogue query values returned 400 rather than being accepted. | E03 |
| Variant low/out views | Seeded stock 50/0/8 and limits | API calculated low and out-of-stock views from variant balances. | E04 |
| Inventory adjustment ledger | `cashews/250g`, balance 20 | API updated the balance and recorded the adjustment movement. | E04 |
| Inventory invalid-input protection | Invalid/negative adjustment test cases | Test suite asserts invalid adjustment rejection and no negative balance result. | E04 |

## 7. Partially completed requirements

The following have a real component but lack one or more required workflows, end-to-end proof, or acceptance evidence: WEB-01.01; PROD-01.01; PROD-02.01; PROD-03.01; CAT-01.01; INV-01.01; INV-02.01; PAY-01.01; ORDER-02.01; SEARCH-01.01; SEARCH-02.01; CMS-01.01; SEC-01.01; ROLE-01.01; TECH-01.01; SCALE-01.01; BIZ-01.01; TEST-01.01. See the individual matrix rows for expected/actual behavior and the linked defects.

## 8. Pending requirements

No usable implementation/evidence exists for HOME-01; HOME-02; PRICE-01; COUPON-01; ACCT-01; WA-01; NOTIFY-01; INVCE-01; REV-01; DASH-01; DASH-02; CUST-01; SEO-01; SEO-02; MKT-01; TECH-02, and the future functionality in SCALE-01. The storefront also lacks customer product-detail/category routing and all customer-account journeys. “Pending” does not mean out of scope; no approved exclusions were supplied.

## 9. Failed requirements

| Requirement | Failure statement | Expected result | Actual result | Impact | Evidence |
|---|---|---|---|---|---|
| WEB-01.03 / CART-01 / CHECK-01 / CHECK-02 | Customer checkout is a demo, not commerce. | Cart must persist and submit a server-priced idempotent order. | `App.jsx` retains cart in React state and uses `Date.now()` confirmation. README confirms no persistence. | Orders, totals, stock and customer commitments cannot be trusted. | E05,E06 |
| VAR-01 / ACC-01 | Variant path is broken across systems. | Selected pack must remain a separately priced/stocked line through invoice. | Storefront hard-codes size/pricing and does not add selected variant to its cart model. | Wrong product/price/stock may be sold. | E04,E05 |
| WEB-01.05 | Legal/content routing is insufficient. | Independent published policy/contact pages. | Privacy and Terms footer links route to FAQ anchors; no legal pages. | Legal/compliance and customer-support risk. | E05 |
| CAT-01.02 | Admin catalogue changes do not prove storefront propagation. | Category changes update navigation/listings/URLs/breadcrumbs. | Storefront category data is hard-coded. | Operations cannot manage the live catalogue. | E05 |
| ORDER-01 | Required order lifecycle is unavailable. | Valid status transitions including packed, delivery, return and refund with history. | Only pending/confirmed/shipped/delivered/cancelled statuses exist; no history. | Fulfilment, returns and reporting are incomplete. | E07 |
| ACC-02 | CMS acceptance journey cannot be executed. | Admin changes content, offer, coupon and SEO without code. | Required CMS domains are absent. | Business is dependent on developers. | E05 |
| FINAL-01 | Platform is not integrated. | One operating storefront/admin/commerce system. | Partial API and separate static demo UI. | Not launchable as ecommerce. | E05-E08 |

## 10. Blocked requirements

| Requirement | Blocking dependency | Evidence required to remove block | Owner |
|---|---|---|---|
| PAY-02, E2E-02, E2E-03 | Razorpay sandbox credentials, webhook endpoint and controlled payment test account | Successful/failure/cancel/retry/callback records and gateway dashboard references | Payments owner |
| RESP-01, E2E-09 | Real browser/device access and deployed staging URL | Device/browser screenshots or recordings with viewport/browser/version | QA owner |
| PERF-01 | Public/staging URL and network test environment | At least three page runs per key page with LCP, INP, CLS, TTFB and waterfall | DevOps/QA |
| HAND-01, E2E-10 | Business-owner credentials and hosting/domain/database/gateway access | Owner-led access, deployment, backup and safe restore demonstration | Business owner/DevOps |
| E2E-01, E2E-04..08 | Integrated staging build, representative test data and provider access | Recorded transactions and data reconciliation | QA/Product |

## 11. Not verifiable requirements

Three items are **NOT VERIFIABLE**, rather than complete: cloud/VPS hosting and CDN configuration, analytics/marketing account ownership, and production monitoring/error reporting. They are discussed in TECH-01/MKT-01 but no deployed-system, account, or runbook evidence was supplied. None is marked Not Applicable because the business owner did not formally approve exclusions.

## 12. Not applicable requirements

**None.** No signed business decision removing a requirement was provided.

## 13. Defect register and remediation

| Defect | Requirement(s) | Finding / impact | Sev. | Fix / acceptance condition | Owner / target |
|---|---|---|---|---|---|
| D-01 | WEB-01, CART-01, CHECK-01/02, FINAL-01 | Storefront uses static products, client calculations and demo confirmation; no real checkout. Revenue/orders are unreliable. | P0 | Storefront uses quoted API cart and creates idempotent orders; prove refresh, retry and real COD order. | FE+BE / 30 Sep |
| D-02 | VAR-01, ACC-01 | Variant choice does not survive storefront cart/order path. | P0 | Variant SKU/price/stock flows listing→cart→order→invoice; test each pack. | FE+BE / 30 Sep |
| D-03 | INV-02, PAY-02 | Payment/stock lifecycle lacks gateway, concurrency and durable transactional evidence. | P0 | Sandbox payment/failure/retry/webhook tests; exactly-once stock movement and no oversell. | BE+Payments / 30 Sep |
| D-04 | WEB-01, CAT-01 | Missing customer product/category details and dynamic catalogue routing. | P1 | API-backed detail/category/search pages with 404s and metadata. | FE / 7 Oct |
| D-05 | WEB-01, ACCT-01, CUST-01 | No customer identity/account domain. | P1 | Secure customer accounts, addresses, orders, recovery and privacy controls. | BE+FE / 14 Oct |
| D-06 | WEB-01 | Mandatory legal/info pages are missing or misrouted to FAQ. | P1 | Approved legal content at independent URLs. | CMS+Legal / 30 Sep |
| D-08 | HOME/CMS/ACC-02 | No usable homepage/banner/content CMS. | P1 | Authorized CRUD/publish/reorder with immediate storefront reflection. | BE+FE / 14 Oct |
| D-14 | PRICE/COUPON | No offer/coupon engine; totals cannot meet commercial rules. | P1 | Server pricing rules, conflict/date limits and invoice parity tests. | BE / 14 Oct |
| D-15 | PAY-01 | Payment methods cannot be treated as live. | P0 | Configure sandbox credentials and test required methods/return flow. | Payments / 30 Sep |
| D-16 | ORDER | Missing status state machine, histories, tracking, returns/refunds/invoices. | P1 | Approved transition model and customer/admin visibility tested. | BE+FE / 14 Oct |
| D-19/20 | NOTIFY/INVCE | No notifications or PDF invoices. | P1 | Provider logs/retries and access-controlled GST PDFs. | BE / 14 Oct |
| D-24/25 | SEO/MKT | No technical SEO or marketing readiness evidence. | P2 | Metadata/sitemap/schema plus consent/event/feed plan. | FE / 21 Oct |
| D-26/27 | RESP/PERF | No responsive device or performance results. | P1/P2 | Recorded device runs and Lighthouse/WebPageTest budgets. | QA/DevOps / 7/21 Oct |
| D-28 | SEC | No production security baseline; development defaults include a sample admin password and fallback JWT secret. | P0 | Secret rotation, prod env validation, HTTPS/security headers/rate limits/backups/scans. | BE+DevOps / 30 Sep |
| D-29 | ROLE | Required role names and activity logging not delivered. | P1 | Business-approved RBAC, server tests and immutable audit events. | BE+FE / 14 Oct |
| D-33 | HAND | Ownership and recovery cannot be confirmed. | P0 | Business owner demonstrates direct access and safe restore. | Business+DevOps / pre-launch |

All defects are **Open / Not retested**. Target dates are proposed audit targets and require owner acceptance. Reproduction details are in section 9 and the traceability matrix; environment is the local development build unless stated blocked.

## 14. Security findings

Security positives: bcrypt comparison is used for admin passwords; JWT admin guard and role guard exist; global validation whitelists/rejects unknown fields; Razorpay webhook verification uses HMAC timing-safe comparison. Significant gaps: no evidence of HTTPS, security headers, rate limiting, password recovery, CSRF strategy, audit logs, dependency scanning, production secret rotation, backup encryption, restore, or error monitoring. The checked-in example has development credentials and a fallback JWT secret; those are a P0 deployment risk if copied to production.

Authorized non-destructive review did not include exploitation. Therefore, absence of a finding is not proof that XSS, CSRF, authentication bypass, injection, file-upload abuse, or dependency vulnerabilities are absent.

## 15. Performance findings

No performance acceptance result exists. Production build output was 321.64 kB JavaScript (95.45 kB gzip) and 59.84 kB CSS (12.98 kB gzip). That compilation fact is not a performance result. Capture mobile and desktop reports for Home, Shop, Category, Product, Search, Cart and Checkout under a declared network/device profile, three runs each, and agree launch thresholds before retest.

## 16. Mobile and responsive findings

CSS has responsive rules and a mobile menu/cart drawer, but no actual mobile-browser evidence was available. Customer checkout is a demo, so even a visually responsive result would not pass the required responsive purchase journey. Test Android Chrome, iPhone Safari, tablet, laptop and desktop at recorded viewport sizes; include keyboard/focus, overflow, touch target, image crop, form-validation and layout-shift checks.

## 17. Data integrity findings

Data integrity: prices are stored in paise server-side in backend services, but the storefront independently calculates browser prices and shipping. The README explicitly confirms that the two layers are not wired. Order code reserves before payment and is not proven under competing requests or real webhooks; returns/refunds are absent. Treat stock and totals as untrusted until E2E proof exists.

Specific acceptance reconciliation required: for every checkout, independently compare client basket, API quote, persisted order, inventory movement, payment record, invoice, notification, dashboard/report output, and database record. Repeat for duplicate request, failed payment, refund and concurrent low-stock order.

## 18. Integration findings

The only integration with implementation evidence is the conditional Razorpay service and signed webhook handler. It cannot be operated without credentials and is not connected to the shipped customer UI. No evidence was found for email, SMS, WhatsApp, logistics/shipping serviceability, analytics, merchant feed, CDN, invoice provider, or error-reporting integrations. These are pending/blocked, not assumed enabled.

## 19. Handover and ownership findings

Source code was inspectable in this workspace. No evidence establishes who controls the Git repository, production database, hosting, domain DNS/registrar, Razorpay account, notification accounts, or backups. No deployment runbook, owner-admin manual, credential transfer record, backup result, or restore demonstration was supplied. This is a P0 launch gate under HAND-01.

## 20. Prioritized remediation plan

1. Resolve D-01, D-02, D-03, D-15, D-28 and D-33 before any public or payment-enabled launch.
2. Resolve customer account/legal/CMS/pricing/order/invoice/notification/RBAC P1 work.
3. Run E2E-01 through E2E-10 against a deployed staging environment with sandbox gateway and test provider inboxes.
4. Capture mobile/browser, accessibility, performance, security, backup/restore and ownership evidence; rerun the complete regression suite.
5. Business owner, product owner, security owner and QA lead must sign the final release decision. The **business owner** is responsible for final approval after those signatures.

## 21. Final launch recommendation

**Not Approved.** Three P0 functional/integrity blockers remain: no integrated real checkout, no end-to-end variant/stock flow, and unproven payment/inventory integrity. Additional P0 blockers are unverified production security and handover/ownership. This decision may be reconsidered only after the remediation and retest evidence listed above is attached.

## 22. Retesting requirements

Retest must be conducted on a deployed staging environment with a unique test product/SKUs, two customer test accounts, one guest account, Super Admin/Manager/Inventory Manager/Order Manager accounts, Razorpay sandbox, provider test inboxes/numbers, and a database snapshot/restore plan. Execute every E2E-01 through E2E-10, all failed rows, all P0/P1 fixes, and regression of the 21 automated tests. Attach anonymized screenshots, request/response evidence, order IDs, payment references, stock-ledger rows, invoice PDFs, notification delivery records, responsive test records, performance reports, and owner handover confirmation. QA lead records retest outcome; business owner makes the final go/no-go decision.
