# Production remediation — 2 November 2026

Applied to https://nutriheaven.co.in and the Ubuntu server. Implementation commits
are `1e28d3e` and `e86e6da`; accompanying documentation and the webhook setup
utility are committed with this report. Local and production source were
synchronized using Git bundles; these commits have not been pushed to GitHub.

## Resolved

| Audit finding | Change and verification |
| --- | --- |
| Development administrator password active | Replaced with a generated unique password; incremented authVersion. A pre-rotation signed session returned HTTP 401. New credentials successfully logged in and read protected settings; verification sessions were logged out. Removed the bootstrap password from production .env. Production catalogue seeding is now disabled to prevent stock/price overwrites. |
| Shared SSH password | Rotated the root password after installing and testing the existing local SSH public key. Verified the replacement password through a separate password-only SSH login. Existing authorized keys were preserved. |
| Missing production mail URL | Set STOREFRONT_URL to the public HTTPS domain. **Email delivery remains blocked by sender setup; see below.** |
| Missing API boot startup | Enabled pm2-deploy systemd startup with the saved process list. Recreated the process with Node --env-file and explicit loopback binding, removing stale injected environment values. Verified service restart/resurrection and subsequent public health checks. No full server reboot was performed. |
| Placeholder customer policies | Published all four operational policies after explicit user approval. Initial HTML and browser pages contain the approved content. Rates and the 7-day return-request window reflect existing behaviour; no dispatch/refund deadlines were invented. |
| IP canonical URLs / homepage metadata everywhere | Updated production build environment to https://nutriheaven.co.in. Added a build guard against HTTP/IP production canonicals. Added an Ubuntu HTTP adapter for the existing SEO handlers and proxied document requests through it. Product initial HTML has product metadata and Product schema. |
| Broken sitemap / robots | Live endpoints now return XML and plain text respectively, with the public HTTPS domain and catalogue URLs. |
| Private-page indexing / soft 404s | Initial HTML for account, checkout, admin and confirmation paths contains noindex; private documents use no-store. Unknown public routes return HTTP 404. Vercel private routes also use the renderer. |
| Missing frontend security headers | Installed Nginx CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy. nginx -t and live HTTP checks passed. |
| Checkout draft lost on refresh | Added cart-scoped session storage for contact/address/coupon/payment selection with a 24-hour expiry. Consent and delivery quotes are not retained. Drafts are cleared on successful checkout. Browser refresh checks passed. |
| Confirmation lost on refresh | Successful checkout now uses /order-confirmation/:id. Reload fetches the order using the existing cart-bound access check. Verified with synthetic intercepted order responses, without creating a real order. |
| Production source and Git differ | Saved a full rollback snapshot and stashed prior server source edits before a fast-forward reconciliation. Both source worktrees are clean apart from the original untracked audit file locally. Server loopback binding is now a repository default in production. |
| CORS excludes the storefront | Explicitly allowed the primary and www HTTPS storefront origins. Actual GET and authorization/content-type POST preflight checks passed. |
| No automatic local backups | Enabled daily application/configuration + mongodump backups with 14-day retention, root-only permissions and success markers. Schedule: 21:00 UTC (02:30 IST), plus up to 15 minutes jitter. Failure does not rotate good backups. |
| Backup restoration unverified | Restored an actual scheduled-job archive into a separate local test database: 25 collection counts, 93 documents and 71 index definitions matched. Checked ObjectId preservation, numeric product prices and published policies. Removed the temporary database after verification. This is a logical-backup rehearsal, not proof of point-in-time consistency during concurrent writes. |
| Monitoring unverified | Enabled local five-minute API/robots/sitemap and backup-age checks. The final check succeeded. Failures are visible through systemd/journald. External alerts still require an external service. |
| Razorpay webhook setup unverified | Provider API showed no configured webhooks. Registered https://nutriheaven.co.in/api/payments/razorpay/webhook using the configured secret. Read-back confirmed active=true, secret_exists=true and payment.captured, payment.failed, refund.created, refund.processed, refund.failed enabled. No payment was charged or refunded. |
| Cloudinary unverified | Uploaded a small synthetic PNG through the authenticated production admin endpoint, retrieved the generated public image, then deleted that verification asset from Cloudinary. |

Browser verification additionally exposed that the cheap payment-availability
GET consumed the payment-operation rate bucket. It now uses the normal read
bucket; payment operations retain their stricter limit. The subsequent browser
run passed without HTTP 429s or console errors.

## Still requires external input or a controlled live transaction

- **Transactional email:** production MAIL_FROM is the Resend onboarding sender,
  and the current API key is send-only. Domain inspection returned
  restricted_api_key. Provide a verified sender on an owned domain (or Resend
  dashboard/DNS access) before enabling real customer delivery. Production now
  rejects onboarding senders rather than presenting email as configured. No email
  was sent during remediation. Recipient and explicit delivery-test authorization
  are needed for a real delivery test.
- **Previously shared provider API secrets:** rotation cannot be established
  without replacement keys/provider account access. SSH and administrator
  credentials were rotated; this does not establish that Resend, Razorpay or
  Cloudinary keys shared in prior conversations have been replaced.
- **Live acceptance:** a real capture → provider-delivered webhook → inventory →
  confirmation email → manual delivery → refund cycle remains untested. The
  configured webhook and passing mocks do not prove actual provider delivery.
  Choose a test purchase, amount, customer/recipient and fulfilment arrangement
  before performing chargeable operations.
- **Off-server backups and external outage alerts:** not configured. The user
  explicitly selected automatic local backups for now. Local backups cannot
  recover from loss of the server itself, and a server cannot report its own
  total outage without an external monitor.
- **Courier booking:** the user explicitly selected manual shipping. Shiprocket
  remains unconfigured, and measured gross parcel weights/pickup defaults must
  be supplied before enabling it. No weights were invented.

## Verification evidence

- Backend and frontend builds succeeded. Vite still reports the existing
  >500 kB JavaScript bundle advisory.
- Backend: 15 suites, 135 tests passed. Legacy fixed-shipping fixtures now select
  their mode explicitly; store/courier quote integration suites enable mandatory
  quotes. Tests no longer load developer .env credentials.
- Frontend: 18 tests passed; SEO/HTTP renderer: 8 tests passed.
- Production HTTP audit passed: API health/catalogue/delivery/payment config,
  document metadata/security headers, sitemap/robots, HTTP 404, nine protected
  JSON endpoints, and actual/preflight CORS.
- Browser: 30 route/viewport combinations at 1440, 768 and 390 pixels, including
  synthetic confirmation responses. No JavaScript exceptions, console errors,
  CSP violations, broken loaded images or horizontal overflow in the final run.
  Checkout name/email restored after refresh at each size. Mobile screenshots
  were visually inspected. No real order was created; normal GET requests did
  create empty guest cart sessions.
- Independent provider read-back confirmed the Razorpay webhook configuration.
  Cloudinary upload/retrieval/cleanup passed.
- Both application services restarted through systemd and passed subsequent
  health checks. Backup and monitor timers are enabled. An unrelated pre-existing
  utho-install-qga first-boot service failure remains outside this application.

Screenshots and machine-readable browser/restore results are in the local private
folder `/home/dev-sharma/.local/share/nutri/production-verification/`.
Replacement credentials are in a mode-0600 file at
`/home/dev-sharma/.local/share/nutri/production-credentials-2026-11-02.txt`.
Neither credentials nor database archives are committed.

Server rollback material is under `/var/backups/nutri-remediation-20261102/`;
prior manual source edits are also preserved in Git stash `pre-remediation-20261102`.
Daily backups are under `/var/backups/nutri/daily/`. Restoring old application
snapshots must preserve the new credential/security settings rather than
re-enabling the exposed credentials.
