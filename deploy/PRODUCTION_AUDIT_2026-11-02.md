# Production deployment audit — 2 November 2026

Scope: read-only public HTTP checks, desktop/mobile browser checks, production
environment, process/startup configuration, Git state, and aggregate database
checks. No orders, payments, emails, uploads, refunds, or shipments were created.
No production configuration was changed during this audit. This is a deployment
readiness review, not a complete penetration test or a business/legal review.

## Confirmed problems

| Priority | Finding | Evidence and effect |
| --- | --- | --- |
| Critical | Development admin password remains active | Compared the bootstrap admin's stored password hash with the known development default: it matches. Do not publish the password. Change it and invalidate existing admin sessions. The SSH credential shared in chat also still authenticates and should be rotated. Rotate previously shared API secrets if not already replaced. |
| High | Transactional email is disabled | `RESEND_API_KEY` and `MAIL_FROM` are present, but `STOREFRONT_URL` is absent from both the file and process environment. `MailService.configured` therefore returns false: password recovery/newsletter signup reject requests in production, and notification emails are not delivered. Set the production site URL, then verify sender/domain configuration and delivery. |
| High | API boot startup is missing | No enabled PM2/application startup systemd unit, application cron job, or rc.local startup was found. `pm2 save` exists but does not itself install boot startup. A reboot may leave the API offline. |
| High | Customer policy pages contain placeholders | Shipping, returns/refunds, privacy, and terms fields are empty in production settings. All four rendered pages display “This information is being updated.” |
| High | Production canonical URLs point to the server IP | `frontend/.env.production` sets `VITE_SITE_URL` to an HTTP IP URL rather than the public HTTPS domain. The deployed HTML and hydrated browser metadata use that IP. Initial HTML also uses homepage metadata on product/shop/policy routes. |
| Medium | Sitemap and robots endpoints are broken | `/sitemap.xml` and `/robots.txt` return HTTP 200 with `text/html` and the SPA shell, not XML/plain text. Nginx serves the static SPA; the Vercel SEO handlers are not running on this deployment. |
| Medium | Private and missing pages have incorrect initial indexing/status | Initial HTML for account/checkout/admin login advertises `index, follow`; account/checkout update noindex only after JavaScript. A nonexistent page returns HTTP 200 rather than 404. |
| Medium | Frontend security headers are absent | Homepage response lacks CSP, HSTS, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy. API headers do not cover the HTML Nginx serves, and `vercel.json` is not applied by Nginx. TLS itself is valid; HTTP redirects to HTTPS and Certbot renewal is scheduled. |
| Medium | Checkout draft is lost on refresh | Browser check: typed a name, reloaded `/checkout`, and the field became blank. The route stays on checkout. The completed-order confirmation is also React state without a durable confirmation URL (source review; not tested using a real order). |
| Medium | Production source and Git are out of sync | Server HEAD is `288d73b`, with manually deployed tracked changes and untracked new source/configuration files. Local audited HEAD is `4b53d75`. Future pulls/resets/rebuilds need reconciliation to preserve deployed fixes and the production loopback binding. |
| Low | CORS allowlist omits the live storefront domain | Actual/preflight checks do not return the live domain as allowed origin. Current same-origin `/api` requests work; this becomes a functional problem for cross-origin clients/deployments. |

## Incomplete or unverified setup

- **Courier integration:** Shiprocket credentials and pickup defaults are absent.
  All 24 active packs lack saved gross shipping weights. Store-mode charges work
  using labelled metric pack weights and the selected slabs; actual courier
  booking, labels, pickup, and tracking are not configured. Delivery must be
  arranged manually until integration is completed.
- **Backups/recovery:** only manual local deployment snapshots were found under
  `/var/backups/nutri-*`. No application/database backup cron or timer was found.
  Managed database backup settings, off-server retention, and restore testing
  were not verified; absence of a server job does not establish that provider
  backups are absent.
- **Payment and fulfilment acceptance:** production collections contain no
  orders, payment webhook events, refunds, or shipments. Live Razorpay mode and
  credentials were verified previously, and software tests verify amount matching,
  but a real capture → webhook → inventory → confirmation email → fulfilment →
  refund cycle has not been demonstrated. A configured webhook secret does not
  prove the provider dashboard webhook URL/events are configured correctly.
- **External services:** Cloudinary and Resend credentials are present, but no
  upload or email was sent during this read-only audit. Their end-to-end behaviour
  still needs verification after fixing mail configuration.
- **Monitoring:** external uptime alerts and backup monitoring were not verified.

## Checks that pass

- API health reports a connected database; MongoDB is a writable replica set.
- API is bound to loopback behind Nginx; proxy trust is restricted, rate limiting
  is enabled, and the configured JWT secret is 64 characters and not the example.
- `/api/checkout/configuration` returns store mode; Razorpay config returns live
  mode. Selected store delivery calculations were verified in the previous task.
- Protected admin endpoints return JSON 401 without authentication. Authenticated
  reads and six rendered admin pages were verified in the preceding deployment.
- Homepage, product, account, policy, and checkout browser checks at 1440/390 px
  showed no JavaScript exceptions, horizontal overflow, or broken loaded images.
- The FSSAI PDF is served as a PDF. The TLS certificate is valid through
  30 January 2027, and automated certificate renewal is scheduled.
- No recorded payment/shipping reconciliation exceptions or refund/webhook
  backlogs were found. These collections are empty, not evidence of completed
  transaction testing.

Suggested order: secure credentials → enable/verify email → configure boot
startup and backups → publish policies → fix site metadata/SEO and headers →
preserve checkout drafts → reconcile deployment workflow → run a controlled live
payment/fulfilment/refund acceptance test.
