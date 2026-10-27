# Shiprocket shipping

One-time setup:

1. Create an API user in Shiprocket and add `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` to the backend environment. Restart the backend.
2. Register your pickup address in Shiprocket.
3. In Admin → Shipping, load pickup locations and save the location name and packed parcel weight (kg) and dimensions (cm).

For each order:

1. Open Admin → Orders and review the customer address, items and payment. Prepaid orders must be paid; COD orders can have pending payment.
2. Pack the items, adjust parcel measurements if needed, and click **Verify & ship**.
3. The server verifies the order, creates the Shiprocket order, assigns its default courier, requests pickup, and generates the label and manifest. Print the documents and attach the label.
4. Use **Dispatch shipment** when handing the parcel to the courier. Scheduling pickup leaves the store order packed and ready to dispatch.

If a request is interrupted, use **Refresh provider details** (enter the Shiprocket order ID if needed), then **Finish shipping setup**. Existing confirmed steps are reused. An uncertain booking must be reconciled before retrying to avoid duplicate shipments. Individual shipment controls remain available for recovery.

Credentials stay on the backend. Shiprocket account setup, serviceability and shipping balance must be ready before real bookings. Automated tests mock Shiprocket; a live booking requires your credentials.

API reference: https://apidocs.shiprocket.in/

Shipping defaults can be edited only by a super admin. Saving checks the pickup location against the current Shiprocket locations; a failed provider lookup leaves the saved defaults unchanged.

After Shiprocket confirms a cancellation, eligible packed orders show **Verify & ship replacement**. The cancelled shipment is retained as history and the replacement uses a new Shiprocket order reference. Cancelled store orders must not be rebooked. Tracking refreshes, including background polling, do not clear errors requiring provider reconciliation.
