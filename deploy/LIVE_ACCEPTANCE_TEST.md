# Live payment, email and refund acceptance

Use https://nutriheaven.co.in and its super-admin account. This checklist involves
one real purchase and a real refund, which you perform yourself. Choose a real,
in-stock product and a total you are comfortable paying, including delivery.
Use your own payment method and a reachable email address. There is no need to
create a fake product, change prices or share card details/OTPs.

## 1. Historical emails and future recovery

All three historical failed notifications were retried after recipient review
and accepted by the email provider on their first retry. Verification found zero
pending and zero exhausted notification emails. Emails
linked to a corrected account use its current email address; guest orders
retain their original recipient. Provider acceptance is verified separately from
inbox receipt. Check the recipient inbox/spam folder and Resend's events for
delivered/bounced outcomes.

For future failures, open **Admin → Sales & engagement → Transactional email**.
After five failed attempts, a message appears with its subject, recipient and
original creation date. **Retry email → Queue email** queues the original
notification. The worker checks every 30 seconds and waits five minutes between
failed attempts. Refresh the list to see whether it needs further review.
Linked accounts use their current email address; guest messages retain their
recorded recipient. An inactive/missing account, an unconfigured sender or an
active processing lease blocks a manual retry. A successful retry removes the
message from the failed list. This means the provider accepted it, not that a
customer has read it.

## 2. Successful online payment

1. Sign in as a customer. Note the selected pack's current inventory quantity in
   Admin → Inventory, then add one unit to the bag.
2. Enter your real delivery address/email, obtain delivery rates, select online
   payment and accept the terms. Note the final total including shipping.
3. Pay through the site's Razorpay checkout. Keep the Nutri Heaven order ID and
   the Razorpay payment ID. Do not send anyone your payment credentials.
4. Expect the confirmation page to show **Payment received**. Reload it: the same
   order should remain visible. In Admin → Orders, the order must show payment
   **paid**, with the same amount as Razorpay's **captured** payment. It should
   remain **confirmed** until staff actually prepare or cancel it.
5. Inventory should decrease by exactly one unit at reservation. Payment
   confirmation must not deduct that unit again. One customer order should exist.
6. In Razorpay's webhook configuration/logs for
   `https://nutriheaven.co.in/api/payments/razorpay/webhook`, confirm the
   `payment.captured` event received HTTP 200. Check the order email in the actual
   customer inbox and confirm it refers to the same order and payment state.

Give the asynchronous webhook/email workers a minute, then refresh. If the
provider says captured but the site remains pending, use **Admin → Orders →
open order → Payments, refunds & cancellation → Check payment with Razorpay**.
Do not pay again to fix a delayed status. Record the order/payment IDs and any
error if it does not reconcile.

## 3. Duplicate webhook / refresh protection

Reload the order and payment-status pages several times. There must still be
one order and one inventory deduction. If Razorpay offers event replay for this
payment, replay the same captured event to the existing webhook endpoint.
It should return HTTP 200 and leave the paid order and stock unchanged. This
uses the same payment; it does not require a second charge.

Razorpay's replay availability and dashboard controls are described in its
[webhook replay documentation](https://razorpay.com/docs/webhooks/replay-events/).
Do not create or edit a webhook secret just to replay a test event.

## 4. Cancel and refund that same purchase

1. Keep this test order unshipped. In Admin → Orders, open it, expand
   **Payments, refunds & cancellation**, choose **Cancel order**, and enter
   `Live acceptance test — cancel before dispatch` as the reason.
2. Expect **cancelled** while payment remains **paid**. Inventory must be restored
   exactly once. Cancelling alone does not send a Razorpay refund.
3. Choose **Issue full refund**, enter a reason and confirm the amount. This
   actually requests a refund to the original payment method. Submit once.
4. A refund may first show **processing**. It must have one provider refund ID
   and match the original paid total. Use **Refresh refund status** if needed;
   refreshing must not create another refund.
5. Only after Razorpay reports the refund **processed** should the site's refund
   record show **completed**, and order/payment show **refunded**. Inventory must
   not increase again because it was already restored on cancellation. Verify
   the `refund.processed` webhook received HTTP 200 and check the refund email.
6. Confirm the credit reaches the original bank/payment source. Provider
   processing and bank credit are separate checks; use Razorpay's refund details
   and reference to follow up. See [Razorpay refund documentation](https://razorpay.com/docs/payments/refunds/).

If the refund shows **reconciliation required**, use **Refresh refund status**
and investigate the existing provider reference. Do not submit a second refund
from Razorpay's dashboard. **Retry confirmed failed refund** is only for a refund
the provider definitively reports failed. Do not mark a parcel delivered or a
refund completed just to make this checklist pass.

## 5. Optional checkout dismissal check — no second charge needed

Start another checkout but close the Razorpay popup without paying. It must not
show payment received, send a paid confirmation or become a paid order. It may
remain pending while the checkout reservation is valid; cancellation/expiry
should release that reservation once. Do not treat this as a refund test because
no money was paid. If money was unexpectedly debited, check the payment with
Razorpay before trying again.

## Read-only server verification

From `/var/www/apps/nutri-heaven/backend`, after step 2 and before preparing or
cancelling the order:

```bash
node --env-file=.env scripts/check-live-order.cjs YOUR_NUTRI_ORDER_ID
```

After step 4 has completed:

```bash
node --env-file=.env scripts/check-live-order.cjs YOUR_NUTRI_ORDER_ID --expect-refunded
```

The checker reads local records and provider payment/refund status. It never
creates a payment, refund or shipment and never changes stock. Every check should
be `PASS`. `WAIT_OR_REVIEW` means the corresponding asynchronous step has not
finished or needs investigation; wait for its worker/provider update, rerun and
retain the output. The checker separately verifies successful payment/refund
webhook processing, stock movements and provider acceptance of order emails.
Inbox receipt and actual bank credit still require your observation.

Send the Nutri order ID, payment ID, refund ID and any failing check back for
investigation. No passwords, API secrets, full card details or OTPs are needed.
