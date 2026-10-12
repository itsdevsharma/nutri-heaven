# Implementation Roadmap

## PHASE 1: Production blockers

### Task ID: P0-01
- Problem being solved: storefront checkout is demo-only and not backed by server-side order and inventory enforcement.
- Proposed change: connect customer storefront to the API-backed cart/order flow and require server-side pricing and validation.
- Affected modules: [frontend/src/App.jsx](../frontend/src/App.jsx), [frontend/src/cart-api.js](../frontend/src/cart-api.js), [backend/src/orders/order.service.ts](../backend/src/orders/order.service.ts)
- Dependencies: order service, cart API, inventory logic, product/variant validation
- Priority: P0
- Estimated effort: 4-6 developer days
- Business impact: high
- Risk: high
- Acceptance criteria: real order creation, server-side pricing, cart state persistence, idempotent checkout
- Required tests: e2e checkout, stock reservation, duplicate order submission

### Task ID: P0-02
- Problem being solved: live payment flow is not verified and cannot be trusted.
- Proposed change: configure sandbox credentials, test all supported payment states, and verify idempotent payment reconciliation.
- Affected modules: [backend/src/payments/payments.service.ts](../backend/src/payments/payments.service.ts), [frontend/src/razorpay.js](../frontend/src/razorpay.js)
- Dependencies: Razorpay credentials, live sandbox account access
- Priority: P0
- Estimated effort: 3-5 developer days
- Business impact: high
- Risk: high
- Acceptance criteria: successful, failed, cancelled, delayed, duplicate, and signature-invalid flows validated
- Required tests: payment sandbox suite and webhook replay tests

### Task ID: P0-03
- Problem being solved: website completion suite fails during MongoMemory setup.
- Proposed change: fix the MongoMemoryReplSet compatibility issue and re-run the full backend suite.
- Affected modules: [backend/test/website-completion.e2e-spec.ts](../backend/test/website-completion.e2e-spec.ts), [backend/test/jest-e2e.js](../backend/test/jest-e2e.js)
- Dependencies: runtime compatibility fix
- Priority: P0
- Estimated effort: 1-2 developer days
- Business impact: medium
- Risk: medium
- Acceptance criteria: all backend test suites pass reliably, including the website completion suite
- Required tests: full backend test run

### Task ID: P0-04
- Problem being solved: production security baseline is not yet present.
- Proposed change: define environment secret handling, backups, TLS, and deployment hardening requirements.
- Affected modules: [backend/src/main.ts](../backend/src/main.ts), [backend/docker-compose.yml](../backend/docker-compose.yml)
- Dependencies: hosting and DevOps approvals
- Priority: P0
- Estimated effort: 2-4 developer days
- Business impact: high
- Risk: high
- Acceptance criteria: production deployment checklist, secret management plan, and backup/restore process documented and tested
- Required tests: deployment review and restore rehearsal

## PHASE 2: Core commerce functionality

### Task ID: P1-01
- Problem being solved: customer accounts and order ownership are incomplete.
- Proposed change: complete customer signup/login/profile/address/order flows and make them secure.
- Affected modules: [backend/src/customers/customer.controller.ts](../backend/src/customers/customer.controller.ts), [frontend/src/customer](../frontend/src/customer)
- Dependencies: auth, order model, address model, email delivery
- Priority: P1
- Estimated effort: 4-6 developer days
- Business impact: high
- Risk: medium
- Acceptance criteria: customer login, orders, address management, and order ownership checks pass
- Required tests: customer auth regression tests

### Task ID: P1-02
- Problem being solved: product and category detail pages are not fully integrated to live data.
- Proposed change: connect storefront browsing to the API and verify category/product routing, 404 handling, and metadata.
- Affected modules: [frontend/src/App.jsx](../frontend/src/App.jsx), [frontend/src/seo.js](../frontend/src/seo.js)
- Dependencies: product browse API, category API, SEO metadata
- Priority: P1
- Estimated effort: 3-4 developer days
- Business impact: medium-high
- Risk: medium
- Acceptance criteria: category and product routes load actual data and handle invalid content cleanly
- Required tests: category/product route smoke tests

### Task ID: P1-03
- Problem being solved: promotions and coupons are not fully operational.
- Proposed change: implement and verify rule-based coupon and offer logic in server-side pricing.
- Affected modules: [backend/src/coupons/coupons.controller.ts](../backend/src/coupons/coupons.controller.ts), [backend/src/offers/offers.controller.ts](../backend/src/offers/offers.controller.ts)
- Dependencies: pricing engine and order totals
- Priority: P1
- Estimated effort: 3-5 developer days
- Business impact: high
- Risk: medium
- Acceptance criteria: valid/invalid coupon states and offer precedence are enforced
- Required tests: coupon + offer calculation suite

## PHASE 3: Admin and operational improvements

### Task ID: P2-01
- Problem being solved: admin purchase and operational workflows are incomplete.
- Proposed change: complete admin dashboards, orders, reports, and customer management with verified reconciliation.
- Affected modules: [frontend/src/admin/pages/DashboardPage.jsx](../frontend/src/admin/pages/DashboardPage.jsx), [frontend/src/admin/pages/OrdersPage.jsx](../frontend/src/admin/pages/OrdersPage.jsx)
- Dependencies: order and customer data, reporting schema
- Priority: P2
- Estimated effort: 5-8 developer days
- Business impact: high
- Risk: medium
- Acceptance criteria: admin can review orders, reconcile KPIs, and verify customer info with least privilege
- Required tests: admin operational e2e and report reconciliation tests

### Task ID: P2-02
- Problem being solved: CMS and content publication is not proven.
- Proposed change: validate banner, faq, and policy management with live storefront rendering.
- Affected modules: [backend/src/cms/cms.module.ts](../backend/src/cms/cms.module.ts), [frontend/src/App.jsx](../frontend/src/App.jsx)
- Dependencies: CMS API and storefront data hydration
- Priority: P2
- Estimated effort: 3-4 developer days
- Business impact: medium
- Risk: low-medium
- Acceptance criteria: published CMS content updates render in storefront without manual code edits
- Required tests: admin content update and storefront render tests

### Task ID: P2-03
- Problem being solved: no complete business process for tracking, delivery, returns, and refunds.
- Proposed change: define a business-approved order state machine and connect it to admin operations and customer status views.
- Affected modules: [backend/src/orders/order.schema.ts](../backend/src/orders/order.schema.ts), [backend/src/orders/order.service.ts](../backend/src/orders/order.service.ts)
- Dependencies: shipping provider and return policy decisions
- Priority: P2
- Estimated effort: 3-5 developer days
- Business impact: high
- Risk: medium
- Acceptance criteria: all allowed order transitions are validated and trackable
- Required tests: order lifecycle and refund tests

## PHASE 4: Security and reliability hardening

### Task ID: P3-01
- Problem being solved: production deployment and recovery steps are not verified.
- Proposed change: establish a managed production configuration, backup process, and restore rehearsal.
- Affected modules: [backend/docker-compose.yml](../backend/docker-compose.yml), [DEPLOYMENT.md](../DEPLOYMENT.md)
- Dependencies: hosting team and access approvals
- Priority: P3
- Estimated effort: 2-3 developer days
- Business impact: high
- Risk: medium
- Acceptance criteria: backup/restore and deployment process is tested and documented
- Required tests: restore rehearsal

### Task ID: P3-02
- Problem being solved: dependency and secret hygiene are not verified.
- Proposed change: run dependency vulnerability audits and secure secret management review.
- Affected modules: package manifests and environment configuration
- Dependencies: package managers and secret store access
- Priority: P3
- Estimated effort: 1-2 developer days
- Business impact: high
- Risk: medium
- Acceptance criteria: no critical vulnerabilities remain and secret handling is documented
- Required tests: package audit and secret scanning

## PHASE 5: Performance, SEO, and accessibility

### Task ID: P4-01
- Problem being solved: no measured Web Vitals or accessibility baseline exists.
- Proposed change: run browser-based performance and accessibility testing and establish launch budgets.
- Affected modules: [frontend/src/App.jsx](../frontend/src/App.jsx), [frontend/src/seo.js](../frontend/src/seo.js)
- Dependencies: staging or local deployment, browser tooling
- Priority: P2
- Estimated effort: 2-3 developer days
- Business impact: medium
- Risk: low
- Acceptance criteria: measured LCP/INP/CLS within agreed thresholds
- Required tests: Lighthouse/WebPageTest + manual accessibility pass

### Task ID: P4-02
- Problem being solved: SEO and structured data coverage are not verified.
- Proposed change: implement canonical and metadata checks and validate crawl-friendly URLs for public pages.
- Affected modules: [frontend/seo](../frontend/seo), [frontend/src/seo.js](../frontend/src/seo.js)
- Dependencies: page routing and production deployment
- Priority: P2
- Estimated effort: 2-3 developer days
- Business impact: medium
- Risk: low
- Acceptance criteria: sitemap, robots, and metadata outputs are valid and crawlable
- Required tests: crawl test and metadata validation

## PHASE 6: Conversion optimization and growth

### Task ID: P5-01
- Problem being solved: the storefront has no proven conversion optimization path.
- Proposed change: prioritize customer trust features, retention, and useful growth features only after core commerce works.
- Affected modules: storefront UI and customer engagement features
- Dependencies: stable product and order flows
- Priority: P3
- Estimated effort: 3-5 developer days
- Business impact: medium
- Risk: low
- Acceptance criteria: selected features provide measurable value without adding operational complexity
- Required tests: A/B or funnel analysis for selected initiative

## Notes on effort estimates

These estimates are engineering estimates only and are not measured production metrics. They are intended to support prioritization and planning, not to represent guaranteed delivery times.
