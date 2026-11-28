# Workflow verification — 2 November 2026

The main tested workflows pass, but this is not a blanket certification that
every production workflow is complete. At the initial audit, three historical notification emails were unsent. The
follow-up below resolves those messages. Live payment/refund acceptance remains
unverified, and automatic courier operations are not configured.

## Resolution follow-up

The notification recovery fix was deployed from commit `41456b7`. All three
historical failures were retried through the super-admin recovery API and
accepted by the email provider on their first retry. Both pending and exhausted
notification counts are now zero. Two linked-account recipients were corrected
using the current account address; the guest recipient was preserved. No
notification was deleted or falsely marked accepted.

Future linked-account deliveries resolve the current email address, including
updates generated for older orders. The super-admin reports page now lists
exhausted messages and offers an audited retry with duplicate protection and
recipient confirmation. Inactive accounts and active processing leases cannot
be overridden by retrying.

Validation: 143 backend tests, 27 frontend/SEO tests, both builds, four viewport
checks of the new controls, live desktop/mobile queue checks and the production
smoke check passed. Razorpay provider read-back confirmed the live webhook is
active with its secret and all required payment/refund events. No payment was
charged or refunded. The read-only order checker and
[LIVE_ACCEPTANCE_TEST.md](LIVE_ACCEPTANCE_TEST.md) cover the remaining user-run
purchase, cancellation, refund, bank-credit and inbox checks.

## Evidence collected

| Area | Result and scope |
| --- | --- |
| Backend | All 15 suites and 136 tests passed against disposable databases. Coverage includes customer accounts, admin roles, products, CMS, coupons, checkout, inventory reservations and competing orders, cancellations/returns, payment contracts/webhooks/refunds, shipping and transactional email. Provider calls in these tests use fixtures. |
| Frontend and SEO | All 27 tests passed. Backend and frontend production builds passed. Vite reports a JavaScript bundle-size advisory. |
| Customer browser journey | Passed signup, profile/address updates, catalogue pagination/search, wishlist, actual COD checkout against a disposable API/database, stock deduction, customer order ownership, password reset, newsletter confirmation and admin reporting. No production order was created. |
| Checkout browser fixtures | Store-delivery and courier fixtures passed at 1440, 768 and 390 pixels: delivery rates, address/payment changes invalidating rates, failed-rate retry, matching Razorpay amounts, refresh/history navigation and no page errors or horizontal overflow. Razorpay and courier calls were mocked. |
| Admin order browser fixtures | Passed at 1440, 768, 390 and 320 pixels: order next-step controls, saved manual tracking, unavailable courier handling, parcel inputs, duplicate-booking prevention and document links. Courier calls were mocked. |
| Admin browser with disposable API | Passed mobile/desktop reports, subscriber filtering/pagination and CSV export, review approval, date filters and previous-period comparison. Shipping settings correctly rejected saving without provider credentials. |
| Production smoke check | Complete rerun passed health, catalogue, delivery/payment configuration, HTML/assets, SEO/security headers, sitemap/robots, true 404s, protected admin endpoints and actual/preflight CORS. The first run encountered two connection failures; four repeated reads of each affected endpoint and the subsequent full run passed. The cause of those transient connection failures was not established. |
| Live browser pages | Twenty desktop/mobile route-and-viewport checks passed. Included home, catalogue, policies, account, admin login, checkout, checkout-draft refresh and synthetic order-confirmation refresh. No JavaScript errors, broken loaded images, CSP violations or horizontal overflow were found in that run. |
| Services | Nginx, SEO and API startup services were active. Backup and monitor timers were enabled; the latest monitor result was successful and a backup success marker existed. No reboot or new restore rehearsal was performed. |

## Remaining limitations and findings

1. **Resolved in the follow-up: three historical notification emails exhausted five attempts.** Two target
   the old `123gmail.com` domain; one targets a Gmail address. They were created
   before the current password-recovery correction. Two other requested
   notification emails have a recorded send timestamp. The three failed messages
   were initially left unchanged during the read-only audit, then reviewed and
   retried under the subsequent explicit instruction to resolve them. Provider
   acceptance is verified; individual inbox receipt remains a recipient check.
2. **Live payment/refund acceptance remains outstanding.** Production had two
   confirmed unpaid orders, one cancelled unpaid order and no refund records.
   Passing provider fixtures do not establish a real charge → webhook → stock →
   order email → fulfilment → refund cycle. No money was charged or refunded.
3. **Shipping is configured for store rates and manual fulfilment.** Shiprocket
   credentials are absent. Automatic booking, pickup and label generation are
   therefore unavailable in production. Backend provider-fixture tests and
   browser fixtures pass; actual courier acceptance is not established.
4. **Email acceptance is different from inbox receipt.** The preceding recovery
   check exercised the deployed sender and public reset/login endpoints with a
   disposable Resend test recipient. A reset email was subsequently accepted for
   the customer's explicitly corrected Gmail address. Inbox receipt and the
   customer's completion of that link remain unconfirmed.
5. **Off-server backups and external outage alerts were not established.** The
   existing local backup/monitor configuration does not cover total server loss.

## Test maintenance

Browser tests were updated locally to follow the current confirmation/review
labels, capture a development-only reset token from the disposable API response
instead of displaying it in the product UI, accept an explicit browser executable,
and expect unconfigured Shiprocket settings to reject a save. These are test-only
changes; no production business data or application configuration was changed by
this audit. Screenshots and live browser results are in the private local folder
`~/.local/share/nutri/workflow-audit-20261102/`.
