# Commerce workflow audit

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

The current checkout is real. `frontend/src/App.jsx` invokes `storefrontApi.placeOrder`, which POSTs /orders. `OrderService.createOrder` reprices server-side and reserves/commits inventory inside a Mongo transaction. Browser evidence verifies COD order persistence and stock 20 → 19 using a disposable replica set.

New signed-in checkout includes the customer access token; the API binds its customer ID and authoritative email. Saved default addresses prefill checkout. Guest checkout stays session-based and does not automatically become account order history.

Customer cancellation uses existing inventory/coupon services. Delivered orders can enter return_requested. Admins handle physical returns and refunds. Captured Razorpay payments on cancelled or returned orders can use the refund endpoint; a regression verifies a repeated completed request does not send a second provider refund.

Automated payment tests use a mocked provider. Live captures, webhook endpoint reachability, provider refund failures and merchant settlement behavior are NOT verified. Courier booking is deferred; admins may record tracking number and HTTP(S) URL.

Order document is a receipt, not a GST/tax invoice. It uses stored order prices and does not invent seller registration or tax amounts.
