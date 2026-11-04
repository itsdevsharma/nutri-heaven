# Customer order tracking and receipts

My account now puts orders first, in a full-width section. The latest order opens
automatically. The journey uses recorded fulfillment stages, legacy order status,
and recognized courier scans. It distinguishes payment from order acceptance;
a paid order can still be waiting for the team to accept it.

The account checks order records every minute while visible and when focus
returns. Refresh orders also checks immediately. This does not re-fetch the
profile or overwrite unsaved profile edits. If refresh fails, the last known
order remains visible with a stale-data message.

Courier name, tracking reference, link, latest scan, scan time and activities
are read from the active stored shipment. Manual tracking details are supported.
Only customer-facing fields are projected from shipment records; internal locks,
provider errors, labels and manifests are excluded. Courier scans follow the
existing shipping synchronization schedule; the page does not invent an ETA.

Receipts require recorded, verified payment on both frontend and server. Pending,
failed and reconciliation-held payments cannot download a receipt. COD receipts
become available after collection is recorded. Historical receipts remain
available after a completed refund and show the amount received and refunded.
Downloads remain owner-authenticated, private, and uncached. They are receipts,
not tax invoices.

## Acceptance check

1. Sign in and open My account. A newly paid order should show Waiting for
   acceptance, an available receipt, and its actual total/adjustment breakdown.
2. As staff, progress the order through accept, pick and pack. Refresh My orders;
   Preparing and Packed should follow the saved stages. Do not mark real parcels
   dispatched or delivered solely to test the interface.
3. When the parcel is genuinely dispatched, add its courier and valid tracking
   number/link. The customer should see On the way and a working Track delivery
   link. Supported courier scans add their latest status and activity history.
4. An unpaid online order should show Complete payment and an explanation about
   receipt availability. An unpaid COD order must not offer Download receipt.
5. After actual COD collection is recorded, refresh the account. The receipt
   should become available. Refund receipts should retain their original payment
   and show the completed refund amount.

Automated tests cover state mapping, courier data ownership, API receipt guards,
refund receipts, unsafe links, refresh failure, preserved profile edits, payment
recovery, and desktop/mobile layouts with mocked customer and courier data.
