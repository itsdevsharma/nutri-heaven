# Order workflow remediation — 4 November 2026

> The previously separate provider-index, product-image snapshot and admin pagination work has now been implemented locally, and the live database has been audited read-only. Current status and the concrete production plan are in [the follow-up release report](ORDER_FOLLOWUP_AND_RELEASE_2026-11-04.md).

Implemented the requested checkout idempotency, courier/order synchronization and crash-recovery fixes within the existing React/NestJS/Mongoose/Razorpay/Shiprocket workflow. No deployment, production database operation, real payment/refund, credential change or destructive migration was performed.

## Implemented behavior

| Original finding | Implementation | Main files |
|---|---|---|
| O01: checkout retries could omit a stable key | Require a 1–128 character non-whitespace key in both DTO and service. Check for an already committed attempt inside the transaction and after validation races. Identical retries return one order even with a usage-limited coupon. Canonical fingerprints tolerate JSON property reordering, with legacy fingerprint compatibility; changed details or owners are rejected | `backend/src/orders/order.dto.ts`, `order.service.ts` |
| O01: repeated browser events | A synchronous submission guard prevents same-frame double submissions. Web Locks serialize cooperating same-origin tabs where supported; they read saved checkout state before creating a new attempt | `frontend/src/App.jsx` |
| O02: courier scans did not update orders | Recognized positive scans advance the existing shipped/out-for-delivery/delivered states transactionally with the shipment snapshot, reservation dispatch, order history and notification intent. A later scan explicitly records inferred intermediate stages. Duplicate/older scans do not regress state or duplicate lifecycle history | `backend/src/shipping/tracking-status.ts`, `shipping.service.ts`, `backend/src/orders/order.service.ts` |
| O02: customer/admin divergence | Authenticated customer and admin order APIs now read the same stored lifecycle state after provider scans. The existing customer tracking join remains in use | Existing customer/admin endpoints; new integration tests |
| O03: coupon interruption gaps | Coupon usage and redemption join the order/reservation transaction. Coupon release joins the cancellation/restoration transaction, including idempotent cancellation retries. Standalone coupon calls own a transaction | `backend/src/coupons/coupons.service.ts`, `backend/src/orders/order.service.ts` |
| O04: booking flag without shipment intent | Claim, optional cancelled-shipment archival and new shipment intent commit together. A committed but unsubmitted intent can resume using its saved parcel/reference | `backend/src/shipping/shipping.service.ts` |
| O04: crash after provider acceptance | Persist submission start and an ambiguity warning **before** the provider POST. A restart/timeout never blindly repeats create. Existing reconciliation locates the accepted booking by its persisted reference and links the provider IDs. The booking worker attempts this read-only reconciliation for ambiguous submissions | `backend/src/shipping/shipping.schema.ts`, `shipping.service.ts` |
| O04: older orphan booking flags | The existing reconcile action can recover a flag with no shipment row by matching the original reference against provider records and persisting the link transactionally | `backend/src/shipping/shipping.service.ts` |
| O05: lost guest tab / creation response | Persist only an expiring opaque checkout/order reference in local storage; contact/address and signed payment responses remain in session storage. A session-bound checkout-key lookup recovers the accepted order without placing another one. An uncertain missing lookup retains the reference and asks the customer to check again rather than authorizing a new purchase | `frontend/src/razorpay.js`, `App.jsx`, `cart-api.js`; `backend/src/orders/order.controller.ts` |

## Preserved workflow restrictions

- Only backend reads from the configured Shiprocket client can invoke courier synchronization. Browser requests cannot submit arbitrary courier status payloads through a new public mutation endpoint.
- Automatic advancement requires an eligible active order, reserved inventory, a verified shipment reference/AWB, and paid online payment or COD. Unpaid online orders, reconciliation exceptions, cancelled orders and return/refund terminal states cannot be fulfilled by scans.
- Delivery does not mark COD cash collected or settled. Finance still records actual collection, settlement and refund evidence separately.
- Booking/AWB/pickup scheduling alone does not imply physical dispatch. Recognized pickup/transit/delivery scans supply the physical fulfilment evidence.
- RTO, cancellations and unknown provider labels do not imply customer delivery or automatically restore stock. Missing AWB/payment eligibility becomes an operations review rather than fabricated delivery.
- A valid provider delivery timestamp is retained when available. If the provider supplies no usable timestamp, the verified observation time is used; the activity retains shipment/AWB/provider-status evidence. Courier times are not used to fabricate cash events.
- Provider calls remain outside MongoDB transactions. No ambiguous provider creation or refund is automatically resubmitted. A no-match or ambiguous reference remains for operations review; eventual provider lookup is not proof that a submission failed.
- Existing statuses, routes, manual courier actions, payment provider and website design remain intact. The only new route is `GET /orders/checkout/:key`, authorized by the existing shopping-session capability. New order requests must now supply `idempotencyKey`; the shipped storefront already does so.

## Executed validation

Full backend suite: **18 suites, 191 tests passed**. The final focused audit/recovery run also passed **31 tests** after the last recovery safeguards. Frontend Node/SEO suite: **39 tests passed**. Backend and frontend builds passed; Vite retains its existing bundle-size warning. Machine-readable scenario results are in [workflow-remediation-evidence-2026-11-04.json](workflow-remediation-evidence-2026-11-04.json).

The new recovery suite exercises real local MongoDB transactions and mocked external providers:

| Scenario | Actual result |
|---|---|
| Two concurrent retries with the same key and final coupon redemption | One order, one redemption, one coupon increment, one stock deduction |
| Reordered JSON / changed request / another owner | Same semantic payload reused the order; changed payload/owner rejected |
| Lost order response recovered by checkout key | Correct session recovered the existing order; another session received 404 |
| Failure after coupon and stock writes but before order insert | Order, stock reservation, coupon usage and redemption rolled back together; retry succeeded |
| Failure after cancellation redemption deletion | Cancellation, stock and coupon deletion rolled back; concurrent retries restored once |
| Failure after booking claim but before intent creation | Claim rolled back, no shipment intent, no external POST; retry booked once |
| Provider accepted booking but response lost | Persisted ambiguity blocked a second create; reference reconciliation recovered provider IDs |
| Restart with an unsubmitted committed intent | Same intent resumed once, no duplicate shipment record |
| Started booking with no matching provider record | No automatic resubmission; ambiguity retained |
| Legacy booking flag with no intent | Read-only provider lookup recovered the shipment link |
| Failure after order lifecycle writes during a courier scan | Shipment snapshot and order lifecycle both rolled back; replay advanced once |
| Repeated delivered / older transit / older out-for-delivery scans | Delivered state, delivery time and lifecycle history remained unchanged |
| Unpaid/cancelled/payment-exception/unknown/RTO/missing-AWB cases | No unauthorized or unsupported fulfilment progression |
| Customer/admin reads after provider delivery | Same delivered state and identical history, with customer courier tracking |
| Concurrent cancellation and booking | Exactly one operation won; no booked order with released inventory |
| Actual child worker SIGKILL after uncommitted coupon redemption | No committed order/redemption/usage; stock unchanged; retry succeeded |
| Actual child worker SIGKILL between booking claim and intent commit | No committed claim or intent; retry booked once |
| Actual child worker SIGKILL after simulated provider commit | Local intent/reference/ambiguity survived; provider lookup recovered the booking; no second create |

The SIGKILL helper refuses non-test or non-loopback databases. Only the disposable test replica's abandoned-transaction lifetime was shortened to two seconds to keep recovery tests practical; production settings were not read or changed. Provider acceptance is simulated in a separate committed test collection, not a real Shiprocket account.

Browser tests passed against local Vite with intercepted APIs:

- Checkout at 1440/768/390px, including an actual double click and an assertion of exactly one order POST.
- Closed-tab response recovery at 1440/768/390px: session storage lost, existing order recovered by opaque key, one payment start, zero new order POSTs, durable reference cleared on completion. A missing checkout lookup retained its recovery reference and did not create another order.
- Existing saved checkout at 1440/768/390px.
- Existing customer payment, tracking and admin operations at 1440/768/390/320px, including refresh/dismissal recovery, manual tracking, mocked booking, receipts and responsive checks.

No live sandbox/provider certification or production database consistency inspection was performed. The original audit's unrelated index-hardening, image-snapshot and admin-pagination observations remain separate follow-up items; no unsafe index migration or historical data rewrite was added to this patch.

## Release and rollback

1. Review and commit the current patch with the prior audit fixes. Retain immutable artifacts for the current deployed backend/frontend. Confirm MongoDB transaction support in staging and production; the application already depends on replica-set transactions.
2. Deploy to staging first. Backend should precede frontend because the frontend recovery lookup is additive. Verify all non-storefront order clients send stable keys; missing keys now correctly return 400. Exercise sandbox payment/webhook delivery and real provider-read reconciliation with test credentials.
3. Verify staging courier labels, AWB identity and delivery timestamps against actual provider responses. Unsupported labels remain non-advancing until deliberately mapped and tested. Validate cancellation, return windows and COD finance separation.
4. Perform the read-only production consistency audit described in the original report before approving legacy record corrections. Legacy ambiguous rebook references that cannot be positively matched require operator investigation; never reset flags or restock blindly.
5. Production rollout still requires explicit approval. Observe order creation failures, payment exceptions, webhook/outbox retries, booking ambiguity and inventory/coupon balances.

Rollback requires no destructive migration. The added shipment field is optional, and historical orders are not rewritten on reads. Restore the previous paired backend/frontend artifacts if necessary; a backend-only rollback would remove the new recovery lookup. Keep durable references, provider IDs and ambiguous shipment intents intact. Do not delete orders or restore an old database snapshot over new payments/orders. Reconcile provider outcomes before any retry and use approved compensating financial/stock changes when needed. Reverting coupon/booking transaction protection reintroduces the audited gaps, so prefer a forward fix for an isolated failure.

**Current assessment:** requested code remediation is implemented and verified locally, including actual process-termination tests. Production release verification and existing production-data consistency remain unverified; this report does not authorize deployment or certify live data.
