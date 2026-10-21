# Order operations: implementation and release checklist

This implements the financial/inventory safety foundation of the recommended workflow. It is not a claim that the entire four-phase roadmap or live provider integrations are production verified.

## Authoritative records
    
- `orders`: immutable checkout line/price/address snapshots, payment capture projection, independent `operations` fulfilment/shipment/return/COD fields, legacy customer-facing status, append-only activity.
- `inventory_reservations`: reserved → allocated → dispatched, or released/closed. Unique checkout reference. Reservation transitions and stock ledger updates share the order transaction.
- `inventory_movements`: available-stock deltas, commits, approved restocks and zero-delta write-off evidence. A write-off never removes sold units a second time.
- `order_refunds`: one full-order refund aggregate, unique request receipt, protected reserved amount, provider reference and retained attempt history.
- `payment_webhook_events`: authenticated events with unique provider event ID (or SHA-256 payload fallback), payload fingerprint, durable retry lease and dead-letter state.
- `order_outbox`: notification intent committed in the same transaction as the order change. A worker hands it off to the existing persistent customer notification queue.

Money remains integer paise. The existing `status` and `paymentStatus` fields remain compatibility projections for the storefront. Independent operational state is authoritative for admin action eligibility. There is no generic endpoint to force a payment successful or a refund completed.

## Daily admin workflow

Open **Orders** and choose Order inbox, Fulfilment, Payment exceptions, Returns & refunds or COD reconciliation. Orders and financial records refresh every 30 seconds; mutations reload immediately.

1. Online orders require captured payment, no blocking exception and a live stock reservation. COD orders can proceed before collection.
2. Accept → Start picking → Mark packed → Ready to dispatch → Dispatch shipment.
3. Dispatch requires courier and tracking number. Out for delivery → Confirm delivery; delivery requires evidence reference.
4. COD delivery leaves payment pending. Finance records collection, then remittance. Remittance can be recorded in instalments, cannot exceed collected cash, and duplicate remittance references are rejected.
5. Before dispatch, the super admin can cancel with a reason. Inventory is released transactionally once. Captured payments remain paid until a verified refund completes.
6. For delivered orders, the customer can request a full-order return within `ORDER_RETURN_WINDOW_DAYS` (default 7). Staff approve or reject, receive, then inspect. Tracking changes, COD collection and remittance do not extend the return window.
7. Inspection must account for every ordered unit. Only sealed items explicitly approved for resale can be restocked. Opened, expired or damaged goods must be written off. Return receipt alone changes no sellable stock.
8. Super admin requests a full Razorpay refund with a reason. A processing or uncertain request is reconciled, never submitted again. Retry is available only for a provider-confirmed failed refund, retaining previous attempt history.

Support can perform warehouse, delivery and return actions. Super admin additionally cancels, refunds and records COD financial events. Backend action checks and the returned `allowedActions` list use the same permission rules. Authentication uses the account's current database role rather than an old token role.

## Recovery guarantees and limits

Order changes, inventory effects and notification intents use MongoDB replica-set transactions. Every explicit action has a client-generated UUID and payload fingerprint; replaying it is a no-op and changing its details is rejected. Unique ledger keys protect concurrent cancellation/expiry from releasing stock twice.

Refund balance is reserved before contacting Razorpay. No network call runs inside a retryable database transaction. If the remote call or subsequent local write fails, the reservation remains protected. Reconciliation fetches by known provider ID or searches paginated refunds for the stored receipt/request note. No match remains uncertain, not permission to resubmit. Provider `processed` is required for completion. Incoming refund webhooks re-fetch current provider state, preventing delayed pending events from overriding final outcomes.

Workers poll durable database records. Refund and webhook work have leases across replicas; notification intent retries safely through a unique event key. Work survives API restarts, but processing pauses while no API worker is running. This is a database-backed worker foundation, not a standalone queue service.

Webhook processing retries with backoff up to eight attempts and exposes pending/dead-letter counts in Orders. Dead-letter recovery currently requires technical investigation. Expired reservations are rechecked against provider capture status before cancellation. Provider outages retain reservations instead of assuming nonpayment.

## Deployment and legacy data

- Deploy backend and frontend together: arbitrary status changes are now rejected; old admin bundles must be refreshed.
- MongoDB must support transactions and unique indexes. Verify indexes for reservations, refunds, webhook events and outbox before enabling operations.
- Configure Razorpay credentials and signed webhook delivery for payment capture/failure and refund events. Keep the raw request body. See [Razorpay refund webhook events](https://razorpay.com/docs/webhooks/refunds/).
- Review `ORDER_RETURN_WINDOW_DAYS` against the actual return policy before deployment.
- Configure the email provider; outbox handoff does not imply an email reached the customer.
- Existing orders are projected conservatively at read time. No automatic financial backfill is performed. Review old refunds against Razorpay before issuing new ones; historical off-platform refunds are not automatically imported.
- Legacy COD `paid` does not prove cash was collected or remitted. Enter collection/remittance evidence after review; never infer settlements from delivery.
- New reservation records cover new checkouts. Inventory physical/reserved/allocated figures require reconciling legacy open orders before relying on them. `stockQuantity` remains available stock; physical stock is available + new reserved + new allocated stock. Batch/quarantine inventory is not implemented.
- Restore and verify the previously suspended backend before live checkout testing.

## Remaining roadmap

These are deliberately not represented as completed capabilities:

- Partial returns/refunds, COD refunds and external-provider refund imports.
- Dedicated Payment/CODSettlement collections and a full financial ledger; COD fields currently live in the transactional order aggregate.
- COD eligibility/serviceability/fraud configuration, courier deductions and discrepancy resolution.
- Shipment booking, labels, automatic tracking, failed delivery/retry/RTO and proof-of-delivery uploads. Current shipping uses manual tracking and evidence references.
- Staff assignment, deadlines/escalations, server-side order pagination/search, richer exception resolution and audit search.
- Batch/expiry management, physical warehouse counts and quarantine stock.
- Secure guest order claiming, invoices, packing slips and operational exports.
- Dedicated worker deployment, notification dead-letter dashboard, webhook replay tools, monitoring and system alerts.

## Verification and release gate

`npm --prefix backend test -- --runInBand` runs HTTP/service tests including actual MongoDB transactions. The workflow suite provisions a disposable replica set and mocks only the remote payment provider. Inventory/payment legacy suites use their configured dedicated test databases.

Covered failures include unpaid fulfilment, invalid transitions, missing shipment/delivery evidence, unauthorized finance actions, COD separation, repeated action UUIDs, duplicate remittance references, concurrent stock release, inspected write-offs, competing refund requests, mismatched refund data, lost provider responses, provider-confirmed failed refund retries, durable notification recovery and webhook replay after an initially unattached provider order.

Build/test success does not establish live money movement, mail delivery or courier behaviour. Before production, run Razorpay test-mode checkout, webhook/refund verification, restart/recovery tests in the deployed environment, legacy-order reconciliation and an end-to-end staff rehearsal. Keep the remaining roadmap visible; do not label the whole order platform production-ready yet.
