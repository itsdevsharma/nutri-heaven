# Bug register

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

| ID | Finding | Status and evidence |
|---|---|---|
| D-01 | Checkout supposedly demo-only | Superseded: `storefrontApi.placeOrder` calls POST /orders; browser audit verifies persisted COD order and stock deduction. |
| D-02 | MongoMemory replica bootstrap fails | Fixed: native Node child avoids Jest VM/driver metadata incompatibility. Eight completion tests pass. |
| D-03 | Payment lifecycle unverified | Split: automated lifecycle and cancellation/refund tests pass; live provider sandbox and webhook delivery remain pending. |
| D-04 | Only first 50 products accessible | Fixed: /products/browse with validated pagination, global search, category descendants and stable sorting. |
| D-05 | Customer controls missing | Implemented: account forms, wishlist, default addresses, inbox, order actions. |
| D-06 | Order ownership based on email alone | Fixed for new account orders: authenticated customer ID is stored and checked. Guest/legacy orders are not auto-claimed by email. |
| D-07 | Password reset link reuse race | Fixed: atomic findOneAndUpdate consumes token and increments authVersion. Concurrent test returns one success and one rejection. |
| D-08 | Paid cancelled orders cannot use refund endpoint | Fixed: cancelled/returned paid orders qualify; repeated completed refunds return existing result. Mock provider regression passes. |
| D-09 | Test product/incorrect photos | Quality report added; actual corrections await owner content review. |

Known limits: email reset throttling is process-local; no distributed abuse control; guest/legacy order claim and email verification are not implemented; provider refund race/reconciliation under real concurrent remote failures still requires merchant sandbox testing. No claim of production security certification.
