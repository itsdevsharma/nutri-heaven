# ORDER WORKFLOW AUDIT REPORT

> Follow-up implementation: the checkout idempotency, courier synchronization, coupon/shipment crash-recovery and guest recovery findings O01–O05 have now been addressed locally. See [implementation and validation report](WORKFLOW_REMEDIATION_2026-11-04.md). The findings and test counts below preserve the original audit evidence; they are not the current implementation status. No production deployment or database certification is implied.

> Further follow-up: O06–O08 code improvements and the read-only live database audit are now complete. See [remaining improvements and production release plan](ORDER_FOLLOWUP_AND_RELEASE_2026-11-04.md) for the actual findings, tested implementation and pending production approval.

Date: 4 November 2026 (Asia/Kolkata). Repository baseline: `f3fd7ba`.

**Assessment: NOT READY for sign-off against the complete requested workflow.** Six reproduced defects have targeted local fixes. Optional checkout idempotency, courier/order lifecycle synchronization, and interruption gaps still need remediation. Passing automated tests do not establish the condition of the deployed database or the actual provider configuration.

No deployment, production database connection, real payment, real refund, inventory reset, production configuration change, or migration was performed. Tests used disposable local MongoDB replica sets and provider doubles. No customer production data was collected.

## 1. Scope and evidence

Reviewed the existing cart, checkout quotes, catalogue pricing/offers, coupon redemption, order DTO/schema/controller/service, inventory ledger/reservations, Razorpay checkout/signatures/webhooks/reconciliation, refund state machine, Shiprocket booking/tracking, authentication/roles, customer order endpoints, storefront checkout recovery, customer tracking, admin order controls, background workers, and existing workflow tests. Unrelated CMS/media features were exercised by the backend suite; this is not a claim of an exhaustive security review of every unrelated module.

The actual implementation is React/Vite + NestJS/TypeScript + Mongoose/MongoDB. Both COD and Razorpay are supported. There is no need to replace the architecture or payment provider.

Customer account, receipt, and associated test files changed concurrently during this audit. Those edits were preserved. In particular, the current customer service joins Shiprocket tracking into customer order responses; this was absent in the initial read. Those changes are not attributed to this patch. Results apply to the local working tree at execution time, not to an independently verified deployed revision.

New evidence: `backend/test/order-audit.e2e-spec.ts`. Machine-readable execution summaries are in `audit-reports/order-workflow-evidence-2026-11-04.json`. The initial reproduction run recorded six failed correctness assertions before fixes; later runs verify their corrected behavior. Two passing *characterization* assertions deliberately demonstrate remaining defects and must not be interpreted as passing workflow requirements.

## 2. Existing workflow

1. The browser keeps a random guest shopping-session identifier in local storage. Cart APIs require `x-cart-id`. Signed-in checkout additionally attaches customer JWT identity. Guest order/payment access uses possession of the cart identifier, rather than account authentication.
2. Cart rows store product/pack, quantity, price/name/image snapshots. After this patch, active cart summaries refresh pack price and stock from the catalogue. The backend remains authoritative at order creation.
3. Checkout supports store delivery rates, Shiprocket quotes, and a disabled-quote compatibility mode. Quotes bind the session, selected packs/quantities, address, payment method, coupon, package, pricing, selected courier and expiry. Current delivery modes reject repeated pack lines; compatibility mode accepts them.
4. `OrderService.createOrder` reprices products and offers, evaluates the coupon and shipping, builds historical line/address snapshots, reserves stock, creates the order and queues notification intent. The inventory/order/outbox writes share a MongoDB transaction. Coupon redemption currently happens outside it.
5. COD creates a `confirmed` order with pending payment and allocated stock. A zero-total COD order is treated as paid. Razorpay creates a `pending` order with reserved stock. Amounts use integer paise. Product prices are treated as tax-inclusive; checkout/order `taxPaise` is zero rather than an independently calculated GST breakdown. Tax invoice/legal correctness was not established by this audit.
6. Online checkout claims provider-order creation before calling Razorpay. Repeated requests reuse the existing provider order or search by receipt after an ambiguous creation. Signed browser verification checks provider order, payment amount and currency, and fetches/captures provider payment before confirmation.
7. Signed raw-body webhooks are persisted with deduplication, leases, retry/backoff and dead-letter state. Captures confirm eligible orders and commit reservations once. Duplicate, late, superseded or mismatched captures require reconciliation. A failed attempt keeps inventory for retry. A minute worker reconciles and expires unpaid orders after 30 minutes.
8. Fulfilment actions are `accept → pick → pack → ready → dispatch → out_for_delivery → deliver`. Public status names remain `confirmed`, `packed`, `shipped`, `out_for_delivery`, `delivered`. The existing `verify` shortcut records explicit operator attestation that preparation and packing are complete; it advances directly to ready-to-dispatch. It still requires eligible stock/payment.
9. Dispatch requires courier and tracking details. Delivery requires an evidence reference. Backend action availability and transactions enforce the workflow independently of the UI. Support can operate fulfilment; financial actions are restricted to super admins.
10. Shiprocket booking, AWB, pickup, labels, manifests, cancellation and tracking are separate provider operations. Paid quoted prepaid orders may be automatically booked. Booking or AWB creation does not itself mark an order shipped. Tracking polls update shipment records, not the order lifecycle.
11. Cancellation is limited to pending/confirmed/packed orders, rejects booked shipments until provider cancellation is confirmed, and releases stock transactionally. Paid online cancellation flags finance review; refunds require a separate admin action. Delivered orders use returns, not direct cancellation.
12. Returns require a delivery timestamp within the configured window, approval, receipt and inspection of the complete order. Only sealed goods may be restocked. Opened/damaged/expired goods are written off without a second stock deduction.
13. Refund requests reserve the refundable amount, persist a request before the provider call, and avoid blind financial retries. Provider `processed` confirmation completes the refund. Ambiguous outcomes are reconciled by provider ID, receipt or notes. COD collection, settlement and externally completed refund recording are separate operations.
14. Customer history is scoped to `customerId`; admin endpoints use JWT/database role checks. The concurrently edited account service now joins tracking records into customer responses. Account polling and manual refresh read backend state. Guest orders are not automatically linked to a later account merely by matching email.

## 3. Confirmed defects and targeted fixes

References below point to the current source; the before-values are from executed reproductions.

| ID | Severity | Evidence / root cause | Before | Local resolution |
|---|---|---|---|---|
| F01 | CRITICAL | `backend/src/payments/refunds.service.ts:101`; completed refunds unconditionally cleared payment reconciliation | Second capture arrived during the first refund; first refund completion set `paymentReconciliationRequired=false`, hiding the remaining charge | Clear only the exception resolved by that refund; preserve duplicate-capture review and note. Regression now passes |
| F02 | CRITICAL | `backend/src/orders/order.service.ts:116`; repeated packs matched the first quoted line total | Quantities 1 and 2 at 10,000 paise stored line totals `[10000,10000]`, while subtotal was 30,000 | Compute each snapshot total from verified unit price × that line's quantity. Regression now returns `[10000,20000]` |
| F03 | HIGH | `backend/src/inventory/inventory.service.ts:350`; reservation aggregates repeated packs but release previously reused one movement key per ungrouped line | Stock 10 → reserve 3 → cancel restored only 1, ending at 8 | Aggregate release quantities by normalized product and pack before applying one idempotent ledger movement. Concurrent cancellation regression ends at 10 |
| F04 | MEDIUM | `backend/src/cart/cart.service.ts:39`; pack-merge branch checked incoming quantity but not existing + incoming | Two quantities of 2 merged into 4 although pack stock was 3; API returned 200 | Validate combined quantity against stock and cart limit before mutation; returns 400 and leaves both rows intact |
| F05 | MEDIUM | `backend/src/cart/cart.service.ts:54`; summary used stored cart price/stock rather than current variant | Catalogue price changed from 10,000 to 12,000; cart still showed 10,000 while checkout priced 12,000 | Refresh active variant price, stock, title and image on summary; server offer logic applies to current price. Regression now shows 12,000 |
| F06 | LOW | `backend/src/cart/cart.controller.ts:7`; invalid session header threw plain `Error` | Missing/invalid header returned 500 | Use `BadRequestException`; both invalid-header cases return 400 |

No frontend layout or design changes were made by this audit. No API route or payload format was replaced. The patch adds no dependencies or schema migration.

## 4. Outstanding issues and minimum proposed changes

| ID | Severity | Evidence | Consequence and smallest next step |
|---|---|---|---|
| O01 | HIGH | `backend/src/orders/order.dto.ts` makes `idempotencyKey` optional; `backend/src/orders/order.service.ts:83` generates a timestamp fallback. Executed characterization creates two distinct orders from repeated requests without a key | Duplicates are prevented only when callers supply/reuse a stable key. Require a bounded, nonblank key for new checkout requests, validate in service and DTO, and reject omission before reserving stock. Verify all deployed callers first. Distinct keys intentionally still represent distinct purchase attempts; the frontend also needs a synchronous submit guard if multi-tab/double-event submissions must be coalesced |
| O02 | HIGH | `backend/src/shipping/shipping.service.ts:202` stores scans; lines 207–208 update booking flag and AWB only. Executed repeated `DELIVERED` scan leaves `orders.status='packed'` | Current customer display can show delivered from joined tracking while cancellation/return rules still use the old stored order state. Add a small, tested provider-status mapper using validated transactional order transitions, monotonic progress, dispatch/delivery evidence, idempotent history and exception handling. Confirm how skipped courier scans should establish intermediate stages before implementation |
| O03 | HIGH | `backend/src/orders/order.service.ts:131` redeems before the transaction; cancellation compensates after commit at line 364. `backend/src/coupons/coupons.service.ts:21–31` increments usage, creates redemption and deletes redemption/decrements usage in separate writes | Confirmed interruption windows can leave usage counts/redemptions inconsistent with orders. No process-kill reproduction was run. Pass the existing order transaction session into coupon writes, including cancellation compensation, and use transaction-safe idempotency. Audit existing records before correcting counts |
| O04 | HIGH | `backend/src/shipping/shipping.service.ts:136–138` commits the order booking flag before creating its shipment intent | A crash/database failure between the two writes leaves a booking claim without a recoverable shipment row; next creation fails its claim. No process-kill reproduction was run. Commit both local writes in one transaction before the provider call; recover flagged orders without a row through a read-only provider-reference lookup and explicit reconciliation |
| O05 | MEDIUM | `frontend/src/razorpay.js:3–8` saves pending checkout only in session storage | Refresh recovery works, but closing a guest tab/browser may lose its pending order pointer. Signed-in users can recover through their account; guests may abandon stock until expiry or create another order. Persist only an opaque pending order/key reference with a TTL, keep address/payment payload out of persistent browser storage, and reconcile before creating another checkout. Browser-close/reopen was not executed |
| O06 | MEDIUM | `backend/src/orders/order.schema.ts` indexes display ID/idempotency but not provider order/payment references | Provider reference uniqueness relies on application/provider behavior, rather than database constraints. No duplicate production records were established. First audit active and superseded references read-only, then propose partial unique indexes where compatible with historical data; never add indexes blindly |
| O07 | LOW | `backend/src/orders/order.service.ts:113` writes `image: ''` | Name, pack, quantity and prices are preserved, but original product image is not. Include a verified catalogue image in the quote/order snapshot for future orders; do not rewrite historical orders |
| O08 | MEDIUM | `backend/src/orders/order.service.ts:79` loads every order; frontend filters/pages the resulting list | Increasing order volume returns all customer data to each authorized admin request and can slow operational queues. Add server pagination/filtering compatible with current admin consumers; benchmark before setting limits. No production-size load test was run |

F01–F06 are fixed locally. O01–O08 remain open; their proposed contract, lifecycle, transaction and operational changes are separated from this small patch. No production record inconsistency is asserted without a database read.

## 5. Security validation

Executed tests rejected forged payment signatures, wrong payment amount/order, wrong cart access, another customer's account order/payment access, unpaid online fulfilment, unauthorized finance actions and invalid status transitions. Verified captures and signed webhook replays commit inventory once. Refund amount/payment/currency mismatches are rejected. Late capture after cancellation is recorded as money received requiring review; it does not reopen cancelled stock reservations.

F01 was a financial security/accounting defect: money reconciliation could be hidden after a legitimate refund. Its regression now passes. O01 remains a duplicate-order/stock-holding exposure. Guest cart identifiers function as bearer capabilities: their possession grants guest order/payment access. Frontend identifiers are random, but there is no separately issued server guest-order credential. Do not treat CORS as authorization or expose cart IDs in URLs/logs. This review did not prove guessable IDs or unauthorized access with an unknown valid random capability.

Payment signature checks, admin/customer DB-backed session validation, revocation and role guards were reviewed. Actual production secrets, reverse proxy ingress, webhook subscriptions, provider capture settings and external rate limiting were not inspected. Normal tests create the Nest test application rather than booting all production middleware in `main.ts`.

The system does not automatically refund every paid cancellation: admin authorization is required. That is an existing explicit finance workflow, not evidence that provider refunds complete automatically. External dashboard refunds and multiple captured payments need finance reconciliation; this patch does not introduce a ledger for refunding each extra capture.

## 6. Database consistency and safe remediation

Local replica-set tests exercised real MongoDB transactions, unique order/idempotency indexes, conditional stock updates, durable reservations, ledger movements, webhook leases and refund reservation/reconciliation. They do not demonstrate that production indexes, data or replica configuration match the code.

Production collection inspection: **NOT TESTED**. No count of orphaned orders, invalid totals, duplicate payments, invalid customer references or incorrect inventory balances can honestly be given.

Read-only inspection plan for an approved maintenance/staging review:

1. Record deployed revision and schema/index definitions; inspect `orders`, `products`, `inventory_movements`, `inventory_reservations`, `coupon_redemptions`, `coupons`, `order_refunds`, `payment_webhook_events`, `order_outbox`, `shiprocket_shipments` and `customers` using their actual configured collection names. Verify names from schema before executing queries.
2. Return aggregate counts and opaque order identifiers only. Group duplicate order IDs, nonblank idempotency keys, active/superseded provider orders and payment IDs. Check statuses/enums and integer nonnegative amounts.
3. Compare sum of line totals to subtotal; compare unit × quantity per line; verify total = max(0, subtotal − discount) + shipping + amount adjustment under the existing inclusive-tax policy. Compare actual captured amount separately for superseded/mismatched payments.
4. Check linked customer existence without treating intentional guest orders as orphans. Check reservations against order payment/fulfilment state, duplicate restoration movements and variant balances against the ledger. Review old repeated-pack cancellations specifically: this patch prevents future incomplete restoration but cannot automatically repair already cancelled records.
5. Match provider references and final amounts with read-only Razorpay queries. Compare reserved/refunded balances to each request/provider outcome. Include duplicate-capture exceptions even if the first refund completed.
6. Find `shiprocketBookingStarted=true` orders without a current shipment row and courier-delivered shipments whose orders have not advanced. Check coupon usage counts against redemption records, orphan redemptions and missing compensation.
7. Produce a dry-run remediation file containing record ID, evidence, expected old values, proposed new values and rollback values. Have operations/finance validate provider and physical-stock facts. Apply only approved, conditional, audited corrections; no deletes, resets, blind restocking or blanket recalculation of old totals.

## 7. Executed tests and requested failure scenarios

Initial full backend baseline: **16 suites / 158 tests passed**. This did not catch the six new defects.

Pre-fix audit reproductions: **6 failed correctness assertions / 1 passing characterization**. Actual failures were incorrect line totals, stock ending at 8 instead of 10, illegal cart merge accepted, bad header returning 500, stale cart price and duplicate-payment warning cleared by refund.

Post-fix targeted audit suite: **12 assertions passed**, including exact one-unit concurrent purchasing, repeated HTTP placement, terminal-state protection and unchanged synthetic historical records. Two of those assertions document O01/O02; they are not successful requirement checks. Final complete backend run: **17 suites / 172 tests passed**. After strengthening the refund regression to include a failed refund outcome between duplicate capture and eventual processed confirmation, all **55 payment/workflow/audit tests** passed again.

Frontend Node suite: **33 tests initially passed; 38 passed after concurrent account tests were added**. Both Nest backend and Vite frontend builds passed. Vite emitted a bundle-size warning (>500 kB), not a build failure. `git diff --check` passed at review time.

Browser execution used the existing scripts against a new local Vite process on port 5175, with payment/order/shipping responses intercepted. Checkout and pending-checkout scripts had only their hard-coded local port replaced in memory. No live API or payment was exercised:

| Browser script | Viewports | Actual result |
|---|---|---|
| `backend/test/checkout.browser.cjs` | 1440, 768, 390 | PASS: checkout reload/back/forward, address/rate invalidation, delivery retry, matching mocked Razorpay amount; script reports no overflow/page errors |
| `frontend/test/pending-checkout.browser.cjs` | 1440, 768, 390 | PASS: saved checkout, return to bag, payment-status check, dismissal/resume |
| `frontend/test/admin-order-workflow.browser.cjs` | 1440, 768, 390, 320 | PASS: next action, manual tracking, unavailable courier, parcel inputs, one mocked booking and document links |
| `frontend/test/customer-order-payment.browser.cjs` | Original run stopped at 1440 | FAIL: exact label expected `₹250`; current concurrent account UI uses `₹250.00` |
| Same customer script, expected currency/cancelled copy adjusted **in memory only** | 1440, 768, 390, 320 | PASS: account payment, another-device recovery, dismissal/refresh, no new order, unrelated bag preserved, refreshed confirmation |
| Current customer payment script after concurrent source/test updates, no in-memory text changes | 1440, 768, 390, 320 | PASS with the repository script and current account formatting/copy |
| Concurrently added `frontend/test/customer-order-tracking.browser.cjs` | 1440, 768, 390, 320 | PASS: tracking refresh, receipt availability, stale-data error handling, preserved profile and responsive layout |

The initial customer script failure was resolved by concurrent account formatting/test changes, and the current repository script was rerun successfully. No functional account defect was demonstrated by that label timeout. A 390px admin delivery screenshot was also visually inspected; no layout redesign was performed by this audit.

For the twenty requested scenarios, PASS below means only the stated local test scope. Provider statements refer to doubles, never a live sandbox certification.

| # | Scenario | Expected result | Actual executed result | Verdict / root cause / next step |
|---|---|---|---|---|
| 1 | Successful prepaid order | Verified captured amount confirms order once | `payments.e2e-spec.ts` verified authorized→captured flow, signed verification and commit deduplication | PASS locally; live provider NOT TESTED |
| 2 | Failed payment | No paid/confirmed prepaid order | Failed attempt retains pending order/reservation; retry reuses provider order | PASS locally; existing payments/inventory suites |
| 3 | Abandoned checkout | Reconcile capture before expiry, release unpaid stock | Expiry test aged local orders: unpaid cancelled, captured confirmed | PASS for worker path; real browser-close/reopen NOT TESTED (O05) |
| 4 | Duplicate Place Order | One order and one reservation | Repeated HTTP request with same key reused order; omitted key produced two IDs | FAIL for unconditional guarantee (O01); PASS only with stable key |
| 5 | Refresh during payment | Resume original attempt | Pending/customer browser fixtures and storage tests resumed original checkout after reload | PASS with fixtures; real Razorpay popup reload NOT TESTED |
| 6 | Payment success, callback missing | Backend recovers without browser callback | Payment-status fetch recovered captured double; signed queued webhook replay confirmed attached order | PASS locally |
| 7 | Out of stock | Reject and preserve inventory | Insufficient stock and multi-line rollback checks executed in inventory/checkout suites | PASS locally |
| 8 | Two simultaneous final-unit purchases | Exactly one succeeds, zero units remain | New exact one-unit test produced one success and one rejection, stock 0 | PASS with real local MongoDB transactions |
| 9 | Invalid admin transition | Backend rejects | Unpaid accept/confirm/pack and premature dispatch rejected | PASS locally |
| 10 | Eligible customer cancellation | Cancel history and restore exactly once | Customer endpoint test plus concurrent service cancellation; repeated-pack case initially failed, now restores all 3 units | PASS after F03 fix, subject to existing booking restrictions |
| 11 | Process cancelled order | Reject | New test rejected `accept` on cancelled order | PASS locally |
| 12 | Duplicate payment webhook | No repeated financial/stock update | Signed event replay deduplicated; failed stored event replay recovered | PASS locally |
| 13 | Duplicate refund request | One provider submission, completion only after confirmation | Concurrent requests submitted one double refund; pending→processed checks passed. Duplicate-capture warning race initially failed, now retained | PASS after F01 fix within supported one-refund-per-order flow |
| 14 | Unauthorized access | No other customer's order read/write | Owner/customer JWT, wrong cart, admin role and finance restrictions tested | PASS locally; deployment/perimeter NOT TESTED |
| 15 | Server interruption | Recover without missing orders, double charge or broken claims | Injected refund response/persistence and notification failures recovered; durable webhook replay tested | NOT TESTED as a full process crash/restart; O03/O04 remain code-confirmed interruption windows |
| 16 | Successful delivery | Correct ordered states and evidence | Manual validated fulfilment, delivery evidence, COD collection and settlement tests passed | PASS for manual actions; automatic courier lifecycle FAIL (O02) |
| 17 | Admin/customer synchronization | Consistent backend lifecycle and tracking | Account/payment fixtures and backend owner reads passed. Duplicate delivered scans stored `DELIVERED` while order stayed `packed` | FAIL for courier/order lifecycle consistency (O02); current tracking join alone does not resolve this |
| 18 | Manipulated price | Backend rejects/ignores client prices, trusted total used | Checkout rejected injected total; quotes/payment fetched server totals and rejected mismatched amounts. Repeated-line snapshot initially failed, fixed | PASS for tested local paths after F02 |
| 19 | Duplicate shipping update | Idempotent, monotonic order tracking | Repeated delivered scans did not duplicate orders but also never advanced the order from packed | FAIL for lifecycle update requirement (O02); complete out-of-order mapper NOT TESTED |
| 20 | Historical preservation | No unintended migration/repricing | Synthetic order without operations read unchanged after catalogue price edit | PASS for synthetic read test; production history NOT TESTED |

## 8. Prioritized implementation and release plan

1. Review this patch: F01 financial exception handling first, then F02 financial snapshots and F03 inventory restoration, then cart/header fixes. Existing field names, routes and status vocabulary remain intact.
2. Address O01 after verifying caller compatibility. Add explicit missing/blank/oversized-key and concurrent submit tests. A passing characterization in the audit suite must become a rejection/deduplication assertion when fixed.
3. Agree courier evidence/scan progression rules and address O02 with a monotonic, idempotent mapping into the existing state machine. Keep cancelled/returned/refunded terminal states protected and retain manual courier support. Test missing scans, duplicated scans, old scans, delivery proof, cancellation races and COD accounting.
4. Extend existing MongoDB transactions for coupon changes and local shipment intent (O03/O04). Add actual process-interruption recovery tests on disposable replicas at each persisted/external-call boundary. Never retry ambiguous charge/refund/booking creation blindly.
5. Address guest recovery, provider-reference indexes after dry-run checks, image snapshots and admin pagination separately. Verify sandbox integration with actual provider credentials/webhook delivery in staging; no real charges/refunds.
6. Run the read-only database audit, finance reconciliation and staging acceptance against a fixed commit, then retest customer tracking, refunds, provider timeouts and all twenty scenarios. Include the concurrently updated customer browser tests in that fixed revision.

### Rollback strategy before any production deployment

No deployment is included. Before an approved release, record the active backend/frontend revisions, retain their immutable build artifacts, verify backup availability and restore procedure, and record the candidate patch revision. Deploy during an agreed observation window with order/payment/webhook/stock exception monitoring.

For this patch there is no schema/data migration to roll back. Revert only this audit's code changes or restore the previous verified backend artifact; do not discard concurrent account work. A rollback does not undo orders, inventory movements, provider captures or refunds created while a release was active. Keep existing durable webhook/refund reconciliation records, reconcile provider outcomes before reattempting anything, and correct financial/stock records only with approved evidence-based compensating actions. If reverting would reintroduce F01/F02/F03, prefer a forward fix or temporarily restrict the affected operation rather than silently restoring the defect.

## 9. Required final summary

PASS denotes the tested local scope only. NOT TESTED denotes absence of live data/provider evidence. FAIL denotes an open requirement gap even where other paths pass.

Order Creation: FAIL

Payment Verification: PASS

Inventory Management: PASS

Admin Order Processing: PASS

Order Status Validation: PASS

Customer Order Tracking: FAIL

Cancellation Handling: PASS

Refund Handling: PASS

Database Consistency: NOT TESTED

Concurrency Protection: PASS

Security Validation: PASS

Production Readiness: NOT READY

These PASS entries do not certify all crash paths, live provider behavior or existing production records. Open interruption gaps and the failed lifecycle/idempotency guarantees prevent production sign-off.
