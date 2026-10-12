# Bug and Defect Register

## Defect list

### D-01 — Storefront checkout is only a demo
- Severity: P0
- Affected component: storefront checkout and order creation
- Description: The customer flow in [frontend/src/App.jsx](../frontend/src/App.jsx) uses in-browser state and a fabricated confirmation with a generated order id, which is not backed by a real server-side order record or inventory ledger.
- Preconditions: storefront is running and a customer enters checkout.
- Reproduction: open the app, add products, continue to checkout, submit an order.
- Expected: a persisted server-side order and stock reservation/commit lifecycle.
- Actual: purchase confirmation is created in the browser without server-side order persistence.
- Evidence: [frontend/src/App.jsx](../frontend/src/App.jsx), [backend/README.md](../backend/README.md)
- Root cause: storefront and backend commerce layers are not connected end-to-end.
- Recommended fix: connect storefront to server-side cart/order APIs and verify idempotency.
- Regression test: end-to-end checkout with real order creation.
- Current status: open

### D-02 — Variant selection does not survive the whole order lifecycle
- Severity: P0
- Affected component: product variant selection and order totals
- Description: selected pack sizes are not validated as a complete, server-side variant path from selection through cart and order.
- Preconditions: product listing includes multiple pack sizes.
- Reproduction: pick a variant in the storefront and complete checkout.
- Expected: variant-specific price, stock, and quantity remain correct through the entire order.
- Actual: storefront logic still manages pricing in the browser and does not guarantee server-side variant integrity.
- Evidence: [frontend/src/App.jsx](../frontend/src/App.jsx), [backend/src/products/product.schema.ts](../backend/src/products/product.schema.ts)
- Root cause: UI variant logic is not wired to an authoritative server-side pricing and order path.
- Recommended fix: force all cart and order creation through server-side product/variant validation.
- Regression test: multi-pack product purchase flow.
- Current status: open

### D-03 — Payment and stock lifecycle is not proven under failure conditions
- Severity: P0
- Affected component: payment and order stock reservation
- Description: the app has payment and order code, but the full lifecycle under retry, timeout, duplicate webhook, and cancellation is unverified.
- Preconditions: online payment credentials and webhook access are absent.
- Reproduction: simulate failed or duplicate payment.
- Expected: no duplicate paid order, no oversell, correct stock release.
- Actual: no real sandbox verification exists.
- Evidence: [backend/src/payments/payments.service.ts](../backend/src/payments/payments.service.ts), [backend/src/orders/order.service.ts](../backend/src/orders/order.service.ts)
- Root cause: integration and transaction tests are not complete.
- Recommended fix: run sandbox payment flows and complete pending-order reconciliation tests.
- Regression test: payment retry and duplicate webhook replay.
- Current status: open

### D-04 — Product and category detail navigation is incomplete
- Severity: P1
- Affected component: shop, category, and product routes
- Description: The storefront loads product data but still has gaps in detail routing and category-based navigation.
- Preconditions: page loads for /shop or /products/:slug.
- Reproduction: open category or product detail URLs.
- Expected: valid routing, SEO metadata, and product detail render from actual backend data.
- Actual: route logic is partial and category/detail behavior is not proven in production conditions.
- Evidence: [frontend/src/App.jsx](../frontend/src/App.jsx), [backend/src/products/products.service.ts](../backend/src/products/products.service.ts)
- Root cause: UI is not fully data-backed and route state is not fully integrated.
- Recommended fix: fully connect storefront routes to actual product and category API payloads.
- Regression test: category browse and product detail page visits.
- Current status: open

### D-05 — Customer account and identity flows are incomplete
- Severity: P1
- Affected component: customer auth and profile
- Description: customer auth and account flows are partially scaffolded but not fully exposed in the storefront or fully validated end-to-end.
- Preconditions: customer attempts login or account access.
- Reproduction: sign up or log in from the storefront.
- Expected: secure account management, order history, and proof of ownership.
- Actual: customer flows are not production-ready and require more verification.
- Evidence: [backend/src/customers/customer.controller.ts](../backend/src/customers/customer.controller.ts), [frontend/src/customer](../frontend/src/customer)
- Root cause: customer-domain implementation is incomplete and not integrated with core checkout.
- Recommended fix: implement customer auth, profile, addresses, wishlist, and order ownership validation.
- Regression test: signup/login/order ownership checks.
- Current status: open

### D-06 — Legal and policy pages are not complete
- Severity: P1
- Affected component: store policy pages
- Description: footer links refer to policy routes, but the app’s legal pages are not proven as true, independent, approved policies.
- Preconditions: click legal links from the footer.
- Reproduction: visit /shipping-policy, /return-policy, /privacy-policy, /terms.
- Expected: stable and curated legal content with published business policy.
- Actual: policy content is not clearly implemented or verified.
- Evidence: [frontend/src/App.jsx](../frontend/src/App.jsx)
- Root cause: content pages are not implemented as independent legal content records.
- Recommended fix: create and manage approved legal content via CMS or static content management.
- Regression test: check page existence and content.
- Current status: open

### D-07 — MongoMemory test environment is failing
- Severity: P1
- Affected component: automated backend verification
- Description: the website-completion e2e suite fails during MongoMemoryReplSet startup due to a driver metadata issue.
- Preconditions: run the backend test suite.
- Reproduction: execute `pnpm -C backend test`.
- Expected: all relevant tests pass or fail only on actual application assertions.
- Actual: test suite fails before app test execution due to MongoMemory server metadata mismatch.
- Evidence: backend test output from the repository run
- Root cause: MongoMemoryReplSet initialization is incompatible with the installed MongoDB driver/client metadata in this environment.
- Recommended fix: update the MongoMemory server config or driver compatibility strategy and re-run the test suite.
- Regression test: full backend suite run.
- Current status: open

### D-08 — CMS and homepage content management are not end-to-end
- Severity: P1
- Affected component: homepage CMS and business content
- Description: banners, FAQ, and social links modules exist, but the storefront does not yet prove live publication from admin input to customer display.
- Preconditions: admin changes content in CMS screens.
- Reproduction: edit homepage banner or content and view storefront.
- Expected: published content reflects in the storefront.
- Actual: partial modules exist without end-to-end proof.
- Evidence: [backend/src/cms/cms.module.ts](../backend/src/cms/cms.module.ts), [frontend/src/App.jsx](../frontend/src/App.jsx)
- Root cause: CMS modules and storefront rendering are not fully connected.
- Recommended fix: validate the admin save/publish flow end-to-end.
- Regression test: banner + FAQs + footer content updates.
- Current status: open

### D-09 — Production security controls are incomplete
- Severity: P0
- Affected component: deployment, secrets, and security baseline
- Description: the app contains a production secret requirement and security headers, but no documented production hardening, rotation, or scanning process is evidenced.
- Preconditions: production deployment is considered.
- Reproduction: inspect deployment and environment handling.
- Expected: secure deployment with secrets outside repo, rate limiting, TLS, and backup/restore process.
- Actual: no such proof is present.
- Evidence: [backend/src/main.ts](../backend/src/main.ts), [backend/docker-compose.yml](../backend/docker-compose.yml)
- Root cause: environment hardening is not part of the current implementation baseline.
- Recommended fix: define and verify production environment security, CI checks, and backup procedures.
- Regression test: environment validation and deployment checklist.
- Current status: open

### D-10 — Reporting and analytics are not verified
- Severity: P2
- Affected component: admin analytics and reporting
- Description: dashboard and analytics code exist in the admin app, but no real reporting reconciliation or KPI validation exists.
- Preconditions: access admin dashboard.
- Reproduction: inspect sales and order metrics.
- Expected: dashboard metrics reconcile with actual stored order data.
- Actual: no verified live dashboard/reconciliation process exists.
- Evidence: [frontend/src/admin/pages/DashboardPage.jsx](../frontend/src/admin/pages/DashboardPage.jsx)
- Root cause: representation of metrics is not verified against business data.
- Recommended fix: implement a reconciled business reporting layer and test it against sample data.
- Regression test: report totals vs. order records.
- Current status: open

### D-11 — No complete end-to-end customer conversion path exists
- Severity: P1
- Affected component: storefront conversion and customer journey
- Description: the core customer journey from catalog to payment confirmation is not fully completed or verified.
- Preconditions: user opens storefront and completes purchase.
- Reproduction: add to cart and go through full payment flow.
- Expected: product discovery, stock validation, cart, checkout, payment, order confirmation, and shipping policy are all intact.
- Actual: the storefront remains a partial demo with no verified end-to-end journey.
- Evidence: [frontend/src/App.jsx](../frontend/src/App.jsx)
- Root cause: business flow is split across incomplete UI and backend modules.
- Recommended fix: complete and verify the commerce flow in a staging environment before release.
- Regression test: full purchase path.
- Current status: open
