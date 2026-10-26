# Shiprocket shipping

Create a dedicated API user in Shiprocket (Settings → API), then set `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` in the backend environment. Restart/redeploy the backend. Do not set these in Vite or paste them into chat. The backend caches its authentication token and renews it before expiry.

In **Admin → Shipping**:
1. Load pickup locations from the connected account. Add or correct the full pickup address in Shiprocket first.
2. Select the matching pickup location name.
3. Enter packed parcel weight in kg and length, width, height in cm; save defaults. No parcel measurements are assumed.

In **Admin → Orders → View order**:
1. Accept, pick, pack, and mark the order ready to dispatch.
2. Check/override parcel measurements and book it in Shiprocket. Prices, customer address, and COD/prepaid mode come from the stored order.
3. Assign an AWB. Leave Courier ID blank to use Shiprocket's default selection, or enter a courier ID from your Shiprocket account.
4. Schedule pickup and generate the label and manifest.
5. Use the existing Dispatch shipment action at physical handover. Booking alone does not dispatch stock. The AWB populates customer tracking.
6. Refresh tracking in the order. A continuously running backend also polls up to ten due shipments per minute, with each shipment due again after five minutes. Tracking scans remain separate from stock, payment and fulfilment state; provider delivery never silently records COD collection.

Bookings and provider operations use persisted locks. A network timeout or unconfirmed response leaves a recoverable record and blocks another creation. Refresh provider details to find the booking by the store order ID; alternatively enter its Shiprocket order ID. The backend verifies that the linked provider order belongs to the exact store order. Definitive provider HTTP validation/authentication rejection permits correction and another attempt. No automatic retry issues another provider POST.

Cancel a booked shipment in the order's Shiprocket panel, refresh until Shiprocket confirms cancellation, then cancel the store order. Until confirmed, store cancellation is blocked to avoid releasing stock while a carrier shipment remains active. Rebooking cancelled shipments is intentionally unavailable; manage replacements as separate store orders.

Local verification uses a disposable Mongo replica set and mocked Shiprocket responses (`test/shipping.e2e-spec.ts`). No real credentials, bookings, pickups or charges are used. Real account permissions, serviceability, wallet balance, pickup address, labels, pricing totals and end-to-end provider tracking still need an owner-reviewed first shipment.

API sources:
- https://apidocs.shiprocket.in/
- https://support.shiprocket.in/support/solutions/articles/43000337456-shiprocket-api-document-helpsheet
