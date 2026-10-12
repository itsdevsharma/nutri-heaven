Razorpay is available in the website checkout alongside cash on delivery. The checkout shows a test-mode notice when the backend uses `rzp_test_` credentials. The browser receives the public key ID from the backend; no API secret belongs in frontend environment variables.

Configure and run:

1. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `backend/.env` locally, and in your backend host's environment for deployment. The supplied test credentials are already configured locally and have passed a read-only authentication check.
2. Set `RAZORPAY_WEBHOOK_SECRET` in the backend environment. A random local value has been generated in `backend/.env`; use exactly that value as the webhook secret in your Razorpay dashboard. The webhook secret is separate from the API key secret.
3. In the Razorpay dashboard's Test Mode webhook settings, add `https://YOUR_API_HOST/payments/razorpay/webhook` and subscribe to `payment.captured` and `payment.failed`. For local testing, use an HTTPS tunnel to the backend. The webhook URL points to the API, not the frontend.
4. Restart the backend after changing environment values. Set `VITE_API_URL` to this backend's origin and allow the frontend origin in `CORS_ORIGINS`.
5. Start the storefront, add a product, proceed to checkout, enter shipping details, accept the terms, select Pay online with Razorpay and use Razorpay's documented test payment details.

The server prices the order, reserves stock, creates a Razorpay order and verifies the signed browser response against the stored provider order. It fetches the payment from Razorpay, checks the order ID, amount and INR currency, and captures an authorized payment before confirming the order. Automatic capture races and duplicate callbacks are handled. Webhooks update the same order and inventory transactionally.

Closing the payment window does not clear the bag or claim success. The saved checkout can resume after a refresh, retry against the same provider order, check payment status, or cancel an unpaid order and release stock. Pending checkout details live in sessionStorage until completion/cancellation, so recovery works within the same browser tab. A backend task reconciles unpaid online orders after 30 minutes before releasing abandoned reservations; provider outages retain stock until reconciliation can retry. Late or mismatched captures are flagged for admin review instead of confirming a cancelled order.

Before taking real payments, deploy both frontend and backend, configure the live-mode keys and live webhook, and complete a real browser test of successful, failed, dismissed and refreshed checkouts. Dashboard configuration requires your Razorpay account access and has not been performed by this code change.

Official integration and test guidance: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
