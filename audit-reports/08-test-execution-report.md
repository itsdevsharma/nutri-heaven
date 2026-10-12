# Test execution report

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

Verified locally on 2026-10-12, Node v22.22.2:

| Command | Result |
|---|---|
| npm run build --prefix backend | PASS |
| npm run build --prefix frontend | PASS |
| npm test --prefix backend -- --runInBand | 9 suites, 59 tests PASS |
| npm run test:seo --prefix frontend | 7 tests PASS |
| npm run test:payments --prefix frontend | 3 tests PASS |
| node backend/test/website-completion.browser.cjs | PASS with PLAYWRIGHT_MODULE pointing to installed Playwright and Vite on 5173 |

Backend suites: products, admin-products, inventory, payments, CMS, admin-users, customers, website-completion, mail. The earlier report's “8 passed, 1 failed” total did not match its eight listed suites.

The initial completion run failed at MongoMemoryReplSet bootstrap with “Missing required sub-document driver”. Starting the replica in native Node outside Jest's VM fixes the handshake without changing production dependencies. Helper cleanup stops the disposable replica on completion/disconnect.

New integration coverage: >50-product pagination, search/sort validation, inbox ownership/read state, newsletter consent/token lifecycle, delivered-purchase review eligibility/moderation, address/order/receipt ownership, escaped receipts, cancellation/return, reporting, failed-email retry, concurrent reset-token consumption.

Browser coverage uses a real isolated API and Mongo replica: signup → profile/address → shop pagination/search → wishlist → COD checkout → database/stock assertion → account history → password reset → newsletter confirmation → admin report. API requests are forwarded to the isolated backend, not mocked. No customer records or orders are created in the live database.

Live Resend inbox delivery, Razorpay sandbox, deployment origins, physical devices, performance budgets, provider concurrency and backup restoration remain unverified. Existing inventory/payment regression suites require the local replica set and use dedicated test databases.

## External check update — 2026-10-12

Direct public probes found 503 responses on the user-supplied production domain for home, shop and sitemap; the older example domain returns 404. Production sign-off remains HOLD. See [external verification evidence](11-external-release-verification.md) for configuration/access gaps and exact observations. No live provider workflows were verified.
