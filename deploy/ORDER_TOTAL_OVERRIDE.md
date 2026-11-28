# Override a final order total

As a super admin, open **Orders → View order → Final order total → Override final total**.
Enter the final total including delivery and discounts, give a reason, and save.
The product, coupon and delivery breakdown stays intact; the difference appears
as an admin adjustment. The order history records the original and revised totals.

For an unpaid online order with an existing Razorpay checkout:

- Ask the customer to close their payment window first.
- Saving checks Razorpay before changing anything. Captured, authorized, or
  otherwise in-progress payments block replacement. A provider outage leaves
  the total unchanged.
- The customer's next **My orders → Complete payment** (or saved-checkout
  **Resume checkout**) creates a new checkout at the revised total.
- The previous Razorpay order cannot be cancelled through the Orders API. It
  remains tracked. A delayed capture on it requires review and blocks fulfillment
  and further payment. Cancel the order and refund the actual captured amount;
  do not fulfill it as if it were paid at the revised total.
- The stock reservation receives a fresh 30-minute payment window on revision.

Paid, cancelled, dispatched, courier-booked, or reconciliation-blocked orders
remain protected. This feature does not silently alter or refund captured money.

## Live acceptance check

Use a fresh unpaid online order you intend to purchase. Close its payment window,
change its final total once, then refresh My orders and choose Complete payment.
Confirm Razorpay shows exactly the revised total before paying. Complete payment
only if you intend to make that purchase. Expect one paid order, the agreed admin
adjustment, one inventory commitment, and the old and new totals in admin history.
An automated test suite covers provider failures, old captures, revisions,
concurrent edits, receipt recovery, refunds, and permissions using provider mocks;
a real customer charge was not made by the assistant.
