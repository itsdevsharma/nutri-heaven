# External release verification — 2026-10-12

Production sign-off: HOLD. No deployment, provider configuration, email delivery, payment capture/refund or catalogue mutation was performed during this check.

## Direct observations

Read-only HTTPS probes from the workspace (approximately 11:05 UTC):

| Origin | / | /shop | /robots.txt | /sitemap.xml |
| --- | --- | --- | --- | --- |
| https://nutri-heaven-mu.vercel.app | 503 | 503 | 200 | 503 |
| https://nutri-heaven-topaz.vercel.app | 404 | 404 | 404 | 404 |

The first origin comes from owner-supplied Vercel logs; the second is in the environment example. The intended canonical origin still needs confirmation. TLS certificate validation succeeded during these requests. A HEAD request to the first origin returned HSTS (`max-age=63072000; includeSubDomains; preload`), but application availability failed. Current server logs are needed to establish the cause; prior ENOENT logs do not prove the current cause.

Local configuration inspection reported key presence only: Razorpay ID, secret and webhook secret are present, and the ID has a test-mode prefix. This does not prove credential validity or configured gateway webhooks. Resend key/sender and production storefront/CORS configuration are absent from the local backend environment; frontend has no local environment file. Hosted configuration remains unknown. No Vercel CLI/project link or deployment credential was found in the inspected workspace/session. Vercel and Resend integrations were discovered but are not connected.

## Release gates and required inputs

- Deployment: connect Vercel or configure authenticated deployment access; confirm frontend project, backend host and HTTPS origins. Backend needs a continuously running process for the email worker and a production Mongo replica set.
- Email: configure RESEND_API_KEY, MAIL_FROM and STOREFRONT_URL server-side; verify sender domain with Resend, then verify reset email and unsubscribe with an approved test inbox.
- Payments: confirm approved test amount/customer, reachable backend webhook endpoint and merchant test configuration; record payment/order/refund IDs and webhook delivery evidence without secrets. Local mocks are not merchant verification.
- Catalogue: owner-approved source images, descriptions, prices, pack sizes and stock are not supplied. Do not substitute invented product information.
- Invoices: seller legal name, registered address, GST registration status/GSTIN and approved product HSN/tax rates remain pending. Existing document remains an order receipt.
- Courier remains deferred by the user.

## Tooling verification

`frontend/scripts/deployment-smoke.mjs` now verifies explicit storefront CORS on GET and authorization/content-type POST preflight, as well as rejecting HTTPS downgrades. Syntax check and a synthetic successful-response execution passed; these are script checks, not production evidence. The full deployed script requires confirmed SMOKE_SITE_URL and SMOKE_API_URL. Production API, accounts, password recovery and order flows remain unverified.
