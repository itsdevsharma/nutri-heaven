# E-Commerce Workflow Audit

## Lifecycle summary

Product discovery -> product selection -> cart -> checkout -> payment -> order creation -> inventory allocation -> fulfillment -> shipping -> delivery -> returns -> refunds

## 1) Product discovery
- Current implementation: the storefront lists products and categories in [frontend/src/App.jsx](../frontend/src/App.jsx). The backend exposes public product browse endpoints in [backend/src/products/products.service.ts](../backend/src/products/products.service.ts).
- API endpoints: `GET /products`, `GET /products/:slug`, `GET /categories`, `POST /products/browse` (as surfaced by the frontend helper)
- Database entities: `Product`, `Category`
- Business rules: active products only are surfaced publicly; product categories are filtered through active records.
- Validation: API validation exists for query payload structure.
- Failure scenarios: category or product not found returns a public error state, but real storefront route validation is not fully proven.
- Missing functionality: product detail SEO, category SEO, and proven category filtering across a live storefront flow.
- Test coverage: backend tests exist for products and browse patterns; storefront route validation is not fully automated.
- Recommended improvements: connect product and category pages to live API data and test invalid-slug handling.

## 2) Product selection
- Current implementation: product cards and modal selection exist in [frontend/src/App.jsx](../frontend/src/App.jsx).
- API endpoints: same public product browse endpoints.
- Database entities: `Product`, `Variant`
- Business rules: each product has variants with pack sizes and stock quantities.
- Validation: variant size and stock are validated on the backend when product data is mutated.
- Failure scenarios: variant selection can be invalid or stale if the browser trust model is used.
- Missing functionality: real variant persistence from product page to cart/order and price recalculation from server.
- Test coverage: product variant validation exists in backend tests but not in a full storefront flow.
- Recommended improvements: server-side cart pricing and variant validation before checkout.

## 3) Cart
- Current implementation: cart logic is in [frontend/src/cart-api.js](../frontend/src/cart-api.js) and the cart drawer is in [frontend/src/App.jsx](../frontend/src/App.jsx). There is also a server-side cart module in [backend/src/cart/cart.module.ts](../backend/src/cart/cart.module.ts).
- API endpoints: `/cart`, `/cart/items`, `/cart/items/:index`
- Database entities: `Cart`
- Business rules: keep guest cart ID, allow item quantity edits, and server-side validation.
- Validation: client-side request validation exists but server-side cart use is not fully proven in the storefront.
- Failure scenarios: stale cart IDs, invalid pack sizes, merged carts, out-of-stock items.
- Missing functionality: verified guest cart persistence and correct cart merge flows.
- Test coverage: not comprehensively proven in end-to-end commerce tests.
- Recommended improvements: complete cart state syncing with API-backed order and quoting logic.

## 4) Checkout
- Current implementation: checkout UI exists in [frontend/src/App.jsx](../frontend/src/App.jsx).
- API endpoints: order placement flows via `POST /orders` and payment creation via `/payments/razorpay/orders/:id`.
- Database entities: `Order`
- Business rules: order uses idempotency and shipping information and calculates totals.
- Validation: client-side required field checks exist; backend validation is implemented for order payloads.
- Failure scenarios: invalid address, invalid coupon, failed payment, duplicate order creation.
- Missing functionality: end-to-end server-backed checkout is not complete; the frontend still demonstrates the flow rather than creating an authoritative order.
- Test coverage: incomplete.
- Recommended improvements: wire the checkout to server-side order placement and validate payment, coupon, address, and inventory conditions.

## 5) Payment
- Current implementation: payment code exists in [backend/src/payments/payments.service.ts](../backend/src/payments/payments.service.ts) with Razorpay setup and verification.
- API endpoints: `/payments/razorpay/config`, `/payments/razorpay/orders/:id`, `/payments/razorpay/orders/:id/verify`, `/payments/razorpay/orders/:id/cancel`
- Database entities: `Order`
- Business rules: order statuses transition from pending to confirmed based on verified payment capture.
- Validation: amount, currency, order match, and signature integrity checks are present.
- Failure scenarios: invalid signature, payment failure, timeout, duplicate capture, delayed webhook.
- Missing functionality: live provider testing and full customer-facing success/failure/resume flow.
- Test coverage: backend tests cover general payment module behavior, but live sandbox verification is still missing.
- Recommended improvements: run sandbox payments and complete payment status recovery paths.

## 6) Order creation and inventory allocation
- Current implementation: order and inventory modules exist in [backend/src/inventory/inventory.service.ts](../backend/src/inventory/inventory.service.ts) and [backend/src/orders/order.service.ts](../backend/src/orders/order.service.ts).
- API endpoints: order placement and inventory movement operations.
- Database entities: `Order`, `InventoryMovement`, `Product`
- Business rules: reserve stock before payment and commit once payment or COD is confirmed; stock updates are recorded with reasons.
- Validation: limited but present; low-stock and order flow checks exist in backend tests.
- Failure scenarios: expired reservation, duplicate order, insufficient stock, payment timeout.
- Missing functionality: complete end-to-end proof under real checkout + payment conditions.
- Test coverage: partial, not complete at storefront level.
- Recommended improvements: add full order lifecycle tests and verify stock release/commit behavior in a transaction group.

## 7) Fulfillment and shipping
- Current implementation: no verified shipping integration or fulfillment orchestration was identified.
- API endpoints: none verified.
- Database entities: order tracking is present in [backend/src/orders/order.schema.ts](../backend/src/orders/order.schema.ts).
- Business rules: status values include shipping states, but fulfillment integration is not proven.
- Validation: status field is defined, but no shipping provider integration is demonstrated.
- Failure scenarios: shipping service outage, failed delivery, returns to origin.
- Missing functionality: actual logistics provider integration and fulfillment tracking.
- Test coverage: not present.
- Recommended improvements: define shipping provider, tracking, and return workflow before production release.

## 8) Returns and refunds
- Current implementation: the order schema includes refund and return states, but the business workflow is not proven complete.
- API endpoints: customer return actions are present in customer controller code.
- Database entities: `Order`
- Business rules: refund and cancellation status transitions are modeled but not fully validated.
- Validation: partial.
- Failure scenarios: refund without valid order state, duplicate return requests.
- Missing functionality: end-to-end refund processing and customer return handling.
- Test coverage: not proven in e2e scenarios.
- Recommended improvements: verify the business process and mapping to payment provider refunds.

## COD flow

The app includes a COD order option in the storefront and `PaymentMethod` enum includes `cod` in [backend/src/orders/order.schema.ts](../backend/src/orders/order.schema.ts). However, there is no proven end-to-end COD flow from storefront to order creation and warehouse fulfillment, and no demonstration that COD orders are properly reconciled with inventory, notification, and fulfillment workflows. This should be treated as a partial implementation until the full process is tested.

## Overall workflow verdict

The overall commerce workflow is architecturally present, but not yet functionally complete or verified. The backend has the right building blocks, but the end-to-end live commerce path needs a controlled staging test before any production recommendation.
