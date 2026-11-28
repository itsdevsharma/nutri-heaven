# Remaining order improvements and production release plan

Date: 4 November 2026, Asia/Kolkata.

The remaining code improvements are implemented locally. The configured live database was audited read-only. No live order fields, inventory, coupons, payments, refunds, indexes, environment variables or deployment were changed.

## Code implemented

### Bounded server-side order management

- `GET /orders/admin/page` returns `items`, matching `total`, `limit`, `offset` and a global order summary. Default page size is 20, maximum 100. Query validation rejects invalid statuses, queues, payment filters, excessive search input and invalid offsets.
- Search, fulfilment/payment filters and operational queues run on the backend. Search characters are escaped before constructing a regex. Sorting uses creation time plus `_id` for a deterministic page order.
- The returns queue includes open/failed refund records through a database lookup, including orders outside the first page. Financial details fetch the selected order's refund records rather than relying on the latest 200 refunds globally.
- Order details have an independent fetch, so an action/filter/page change does not discard the open order. Polling and mutation refreshes reload both list and details. Financial actions wait for refund records to load.
- Summary counts represent the whole store, not just the loaded page. The legacy `/orders/admin` retains its array response, bounded to 100 records; consumers needing more records should use the page endpoint.
- Existing components, brand, layout and workflows are retained. Accessible filter names were added. Mobile order IDs/timestamps remain readable within the existing horizontally scrollable table.

Main files: `backend/src/orders/order-list.dto.ts`, `order.controller.ts`, `order.service.ts`, `backend/src/payments/payments.controller.ts`, `payments.dto.ts`, `frontend/src/admin/pages/OrdersPage.jsx`, `frontend/src/admin/lib/api.js`, `frontend/src/admin/admin.css`.

### Immutable product-image snapshots

- New orders snapshot the selected variant's first image, with the verified product image as fallback.
- Editing catalogue images afterward does not alter the stored order image.
- Images are excluded from pricing fingerprints, preserving the original pricing contract and preventing an image-only edit from invalidating existing delivery quotes.
- Existing historical orders are not rewritten. An image that was never recorded cannot be reconstructed reliably from the current catalogue; no current image was falsely backfilled as the original historical image.

Main files: `backend/src/products/products.service.ts`, `backend/src/orders/order.service.ts`, `backend/src/checkout/checkout.service.ts`.

### Provider-reference constraints and controlled index installation

- `razorpayOrderReferences` stores current and superseded provider order IDs in one uniqueness namespace. Order validation/save and provider-order attachment maintain the derived field.
- Partial unique indexes protect the combined namespace, active provider order ID, and payment ID while allowing absent/blank references.
- Three additional indexes support stable order pagination and common status/payment filters.
- The authoritative six-index manifest is `backend/src/orders/provider-indexes.json`. Production startup does not build these new indexes automatically. Tests build them in their disposable database; explicit development opt-in is `ORDER_AUTO_BUILD_INDEXES=true` outside production.
- `backend/scripts/order-consistency.cjs` performs a read-only audit by default. It does not bootstrap Nest, initialize models, seed data, call providers, or repair financial records.
- Index application requires explicit write opt-in, exact database confirmation, the reviewed backfill count, and a protected backup file. Changed counts, duplicate/invalid references, failed backup writes or concurrent reference changes stop maintenance. Backfills use conditional updates and touch only derived reference metadata. Existing field values are written to the backup before each update; the backup cannot be silently overwritten.
- The maintenance tool never drops existing indexes, deletes orders, rewrites totals/payment references, restocks products or submits a charge/refund.

## Actual read-only live database findings

Evidence: [production consistency report](PRODUCTION_ORDER_CONSISTENCY_2026-11-04.json). Latest read completed at **14:06:35 IST**.

| Checked records | Count |
|---|---:|
| Orders | 12 |
| Product variants | 24 |
| Stock reservations | 12 |
| Refund records | 0 |
| Coupon redemptions | 0 |
| Shipment records | 0 |

The implemented checks found **8 orders requiring derived provider-reference metadata backfill**. The six proposed indexes are not installed. No duplicate order/checkout/provider/payment references, invalid totals, invalid capture/refund amounts, unpaid online fulfilment, expired online reservations, orphan customer/reservation/refund/shipment links, ledger balance differences, coupon count differences or courier/order delivery discrepancies were detected by those checks.

This is a database consistency result, not verification against Razorpay, Shiprocket or a physical stock count. The audit uses sequential majority reads rather than a single cross-collection snapshot, so records changing during a future audit must be rechecked before any correction. Reports contain counts and opaque record IDs, not customer names, email, phone or address.

There is no evidence from these checks requiring an automatic financial or inventory repair. No such repair was attempted.

## Validation performed

- Full backend suite: **19 suites / 200 tests passed**.
- Frontend Node/SEO suite: **39 tests passed**.
- Focused final checkout/store-delivery/follow-up verification: **32 tests passed**, covering quote compatibility after image-only changes.
- Focused maintenance safety suite: **9 tests passed**, including duplicate refusal, explicit opt-in/database/count guards, backup failure before mutation, idempotent metadata backfill and actual unique-index enforcement in disposable databases.
- Backend and frontend builds passed. The existing Vite bundle-size warning remains.
- Admin pagination browser checks passed at **1440, 768, 390 and 320px**: bounded server requests, search across pages, filters, independent details, error/retry, readable row heights and no page overflow.
- Existing admin workflow and amount-override browser checks passed at the same four widths after moving to the page API and independent detail requests.
- A rendered 390px order table was visually inspected; compact rows and horizontal scrolling preserve the existing design.
- `git diff --check` passed.

Machine-readable local evidence: [follow-up test evidence](order-followup-evidence-2026-11-04.json). All order/payment/courier mutations during tests used disposable local databases and intercepted/mock providers. No real charge or refund was created.

## Concrete production step awaiting approval

Reviewable plan: [production release plan](PRODUCTION_ORDER_RELEASE_PLAN_2026-11-04.json).

At the audited snapshot, the proposed database changes are precisely:

1. Recompute `razorpayOrderReferences` metadata on **8 order records**, from their existing current/superseded references. Preserve monetary amounts, payment status/IDs, customer details, line snapshots, status history, stock and timestamps.
2. Install **6 indexes** from the checked-in manifest: three unique provider/payment indexes and three pagination indexes.
3. Deploy the reviewed backend/frontend candidate only after staging/provider validation succeeds.

The original request explicitly says **“Never modify production orders without approval”** and **“Do not make major changes or deploy anything without my approval.”** The production metadata/index operation and application release were therefore prepared for review and not executed. The read-only audit is complete.

### Release order

1. Supply a staging API URL and sandbox environment-file path. The available local configuration has live Razorpay keys, no Shiprocket credentials, and no staging URL. Do not send secret values in chat and do not replace production environment values with test credentials.
2. Record a reviewed candidate commit; build and deploy that candidate to staging. Verify actual Razorpay sandbox checkout/capture/webhook/reconciliation and configured Shiprocket responses. The current browser/backend tests use provider doubles and do not constitute that external verification.
3. After explicit production approval, retain the previous immutable backend/frontend artifacts and confirm backup/restore access. Update the backend writers first so new provider attachments maintain the combined reference field.
4. Rerun the read-only audit. If the reviewed count or duplicate/invalid-reference preflight changed, stop for a refreshed plan. Do not force index creation through dirty data.
5. Apply the reviewed metadata/index operation, with the backup written to a protected directory. Confirm all six indexes exist and all reference caches match their source fields. Do not run schema synchronization that drops indexes outside this manifest-based maintenance process.
6. Release the frontend after the new page/recovery APIs are available, retain previous hashed assets for active clients, run deployment smoke checks and monitor order creation, payment exceptions, webhook/outbox recovery and inventory/coupon balances.

### Prepared commands — not executed against production

From the repository root, with protected existing environment files and a protected backup directory chosen by the operator:

```bash
node --env-file=backend/.env backend/scripts/order-consistency.cjs --audit --output /secure/order-preflight.json

node --env-file=backend/.env backend/scripts/order-consistency.cjs --apply-indexes --allow-writes --database-confirm nutri_heaven --expected-backfills 8 --backup /secure/order-reference-backup.jsonl --output /secure/order-index-result.json
```

The second command requires approval and a fresh matching preflight. It refuses to reuse an existing backup file. The environment file must identify the reviewed database; no credentials are embedded in these commands or reports.

## Rollback

Restore the previous paired application artifacts if needed. Keep the optional reference metadata and database uniqueness constraints unless a separately reviewed index issue requires intervention; older application code can ignore the added metadata field. Do not drop constraints simply to admit a duplicate reference.

The protected JSONL backup records previous cache values/existence and expected applied values per opaque record ID. If metadata rollback is necessary, restore only that field with conditional updates after checking current provider-reference sources. Never replay a whole historical order document or overwrite financial/status changes made since the release. No automated financial rollback, database snapshot restore over new orders, stock reset or provider resubmission is part of this patch.

**Current state:** code improvements and the read-only production audit are complete. Staging/provider certification, production index application and deployment still need the requested staging details and explicit production approval. No live write or deployment has been performed.
