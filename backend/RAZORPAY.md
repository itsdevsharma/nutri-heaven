# Razorpay Standard Web Checkout

The React/Vite storefront and NestJS backend already share a Standard Checkout
flow. Keep the existing routes so payment creation stays tied to a priced store
order and its stock reservation.

## Configuration

Run `pnpm -C backend install --frozen-lockfile`. Set `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET` in `backend/.env` (or the backend host's environment).
The repository ignores this file. Use test keys for test payments.

No frontend Razorpay environment variable is needed: the create response provides
only the public key ID. Never put the key secret into a `VITE_*` variable.
Set `VITE_API_URL` in `frontend/.env.local` for local development, or
`frontend/.env.production` before building the deployed frontend. It must point
to the backend origin or a configured API proxy, not a frontend HTML route.

## Existing endpoints

- `GET /payments/razorpay/config`: availability and test-mode flag, no credentials.
- `POST /payments/razorpay/orders/:id`: create/reuse a provider order for the store
  order ID; send its `x-cart-id` header. Returns `keyId`, `orderId` (store order),
  `razorpayOrderId` (provider order), `amount` in paise, and `currency`.
- `POST /payments/razorpay/orders/:id/verify`: send `x-cart-id` and JSON fields
  `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`. The backend
  checks HMAC-SHA256 against the stored provider order ID, then validates the
  provider payment's amount, currency and captured status before confirming.
- `GET /payments/razorpay/orders/:id`: recover payment status after interruption.

Totals come from the backend catalogue and delivery calculation, not a browser
amount. The minimum is 100 paise. Invalid amounts or verification fields and
signature mismatches return 400. Provider authentication failures during order
creation return 401; other provider creation errors return 500. Missing backend
credentials return 503; requests from another shopping session return 403.

## Local testing

1. Start the MongoDB replica set required for inventory transactions (see
   `README.md`), and seed the development catalogue if needed.
2. Run `pnpm -C backend dev` and `pnpm -C frontend dev` in separate terminals.
3. Add an in-stock product to the bag, proceed to checkout, fill the contact and
   delivery fields, accept the terms, select **Pay online with Razorpay**, and
   click **Pay online**. When Shiprocket checkout is enabled, select a delivery
   quote first.
4. Complete a test payment in the Razorpay modal. Confirmation appears only after
   backend verification and capture. Also test dismissing the modal and a failed
   payment; the saved checkout supports retry/status recovery.
5. In the Razorpay test dashboard, configure the public HTTPS endpoint
   `/payments/razorpay/webhook`, set the matching `RAZORPAY_WEBHOOK_SECRET` on the
   backend, and subscribe to `payment.captured`, `payment.failed`, and the refund
   events used by the existing refund flow. This supports recovery if the browser
   closes before verification. Reload the backend after changing its environment.

Focused automated checks (provider mocked; no charge):

```bash
pnpm -C backend exec jest --config test/jest-e2e.js --runInBand payments-contract
pnpm -C frontend test:payments
```

On the server, configure its own ignored environment files, rebuild the frontend,
and restart the backend's existing PM2 process with `--update-env` if its injected
environment changed. A local `.env` file is not included in `git pull`.

Reference: [Razorpay Standard Checkout integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/).
