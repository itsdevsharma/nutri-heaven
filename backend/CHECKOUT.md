# Checkout, Razorpay and Shiprocket

The application remains React 19/Vite, NestJS 11/TypeScript and MongoDB/Mongoose.
Existing cart identifiers are guest capabilities; signed-in order creation retains
customer ownership. Prices are integer paise. Razorpay is already installed and
integrated, including server verification/capture, raw-body signed webhooks,
durable event deduplication/retries, full refunds and payment reconciliation.
Inventory reservations and order state changes use replica-set transactions.
Customer notifications continue through the existing transactional outbox.

## Flow and modules

- `src/checkout/checkout.module.ts`, `checkout.dto.ts`, `checkout.service.ts` and
  `checkout.schema.ts` add `/checkout/configuration` and `POST /checkout/quotes`.
  The request contains `cartId`, cart `lines` (`productSlug`, `packSize`, quantity),
  `deliveryAddress`, `paymentMethod` and optional `couponCode`. No prices are accepted.
- The quote service loads active products/variants, gross weights, dimensions,
  inventory, offer prices and coupon eligibility. Existing prices include GST;
  `taxPaise=0` means no additional tax is added. Product offer discounts are already
  included in unit prices; coupon discounts are saved separately.
- Store dimensions are a fallback per-pack box. Optional variant `lengthCm`,
  `breadthCm`, `heightCm` override them. A single parcel stacks packs along height,
  using maximum length/breadth and summed gross weights with the store weight floor.
  Set gross weights including packaging; this is a deterministic packing policy,
  not a packing optimizer. Oversized parcels need a store delivery arrangement.
- Shiprocket pickup settings supply the origin PIN. Its serviceability response
  supplies eligible courier IDs, names, `rate` and delivery estimates. Rates are
  converted from rupees to paise. No available services or API failure blocks checkout.
- `checkout_quotes` stores cart/input and pricing fingerprints, parcel, all options,
  subtotal/discount/tax and ten-minute expiry. Cleanup occurs a day after expiry;
  expiry is always checked in application code, independently of the TTL monitor.
- Order DTO/schema/service persist the selected quote, courier, parcel, currency,
  exact amounts, payment-creation claim and checkout fingerprint. Changed address,
  cart, prices, package, coupon or rate requires a fresh quote and confirmation.
  Reused checkout keys with changed payloads are rejected. Stock is reserved in the
  existing order transaction; coupon redemption is checked against the quote.
- Razorpay startup revalidates the quote and compares the payable amount. A durable
  claim prevents concurrent provider creates. An interrupted call is recovered by
  searching Razorpay orders by receipt and matching amount/currency. If the provider
  confirms no matching order, do not blindly recreate: cancel the unpaid store order
  and start a fresh checkout. The existing 30-minute reservation reconciliation still
  applies. Expired quotes on unpaid saved orders require cancelling and re-quoting.
- Captured payments are verified against the stored amount/currency; signature
  verification, durable webhooks, inventory commit and reconciliation remain in the
  existing services. A gateway capture that arrives after quote expiry still settles
  the exact already-confirmed order amount; never discard captured money or charge
  a new amount. Late captures after stock release require manual refund/reconciliation.
- The shipping service polls every minute for eligible paid online quoted orders.
  It creates a Shiprocket order/shipment and assigns the selected courier's AWB.
  Saved order state is the durable job source; failed attempts retry after five minutes.
  Existing unique shipment records, atomic claims and operation leases prevent
  duplicate bookings. Ambiguous writes require the existing admin reconciliation
  workflow instead of blind retries. Tracking continues through the existing poller.
  Packing, physical handover, pickup, labels and manifests remain admin operations.
  COD keeps its existing admin verification/shipping workflow.
- `frontend/src/App.jsx` and `cart-api.js` add delivery lookup, selection, expiry,
  authoritative totals and invalidation on input changes. The product editor exposes
  gross weight and dimensions. Admin shipment details show booking-review messages.

## Rollout / configuration

1. Use a MongoDB replica set (as required by the existing inventory/payment flow).
   Mongoose creates the additive fields, quote collection and indexes; this project
   has no migration runner. No existing order rewrite is required. If production
   disables automatic index creation, deploy the unique `checkout_quotes.id` and
   TTL `expiresAt` indexes with the normal database index deployment process.
2. Populate each active variant's `weightGrams` in Admin > Products; quotes reject
   packs without positive gross weights. Enter measured pack dimensions there, or
   configure conservative per-pack dimensions in Admin > Shipping, plus a real pickup.
3. Set server-only `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` to API user credentials.
   Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` with the
   existing test/live integration. Configure `/payments/razorpay/webhook` in Razorpay
   for captured/failed payment and refund events used by the existing integration.
4. Set `SHIPROCKET_CHECKOUT_ENABLED=true` after setup. Default `false` preserves the
   legacy fixed-fee checkout during rollout. When enabled, omitting a quote cannot
   bypass server rate calculation, including for COD. Never expose secrets in Vite.
5. `SHIPROCKET_RATE_DIFFERENCE_POLICY=hold` stops booking when a post-payment rate
   differs and surfaces a review message. `absorb` permits the merchant to pay the
   difference. Customer totals never increase automatically. Unavailable selected
   couriers always require review. Carrier weight audits and later invoice changes
   are merchant costs requiring operational reconciliation; they do not trigger
   another customer payment. The system does not automatically debit customers or
   issue credits for later carrier adjustments.
6. Complete a Razorpay test-mode capture and signed webhook test, then a deliberate
   Shiprocket booking/tracking test. Shiprocket calls can create real shipments;
   no live provider test was performed as part of this implementation.

## Focused verification

- `pnpm -C backend test --runInBand checkout shipping`
- Existing regression suites: `payments.e2e-spec`, `inventory.e2e-spec`,
  `order-workflow.e2e-spec` (use disposable replica-set database URIs).
- `pnpm -C backend build` and `pnpm -C frontend build`
- `pnpm -C frontend test:payments`
- With Vite running on port 5173:
  `PLAYWRIGHT_MODULE=/path/to/playwright node backend/test/checkout.browser.cjs`
  This uses API fixtures, checks 1440/768/390px, delivery selection/invalidation,
  total display, submitted quote/courier, confirmed COD order, page errors and overflow.
  Screenshots go to `/tmp/nutri-checkout-preview`. It does not test live providers.

Provider contracts were checked against the [official Shiprocket API documentation](https://apidocs.shiprocket.in/)
and its [official serviceability examples](https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/documentation/qu05zax/shiprocket-api).
Payment verification follows the existing integration and [Razorpay's security checklist](https://razorpay.com/security/checklist).
