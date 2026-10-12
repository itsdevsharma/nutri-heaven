# Remaining roadmap after implementation

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

Completed local work is tracked in [WEBSITE_COMPLETION.md](../docs/audits/WEBSITE_COMPLETION.md). Do not rebuild checkout or the customer modules based on the superseded baseline.

1. Configure Resend verified sender, RESEND_API_KEY, MAIL_FROM and STOREFRONT_URL. Test reset link arrival, expiry and welcome/order emails using a test inbox.
2. Review catalogue flags and supply correct product images/copy. Review business policy content.
3. Deploy backend and frontend together. Execute `SMOKE_SITE_URL=... SMOKE_API_URL=... npm run audit:deployment --prefix frontend`.
4. Verify Razorpay merchant sandbox captures, failed/dismissed checkout, duplicate/late webhooks and cancellation refunds. Local mock tests are not live proof.
5. Confirm seller/tax details before adding a tax-invoice document. Current downloadable receipt is intentionally labelled as a receipt.
6. Define a verified guest/legacy order claim process if historic orders should appear in accounts. Do not migrate by email alone.
7. Operational hardening: distributed abuse controls, queue retry management, backups/restore tests, monitoring and measured performance/accessibility audits.
8. Courier integration is explicitly deferred by the user; keep manual tracking until a provider is selected.

No production write, deployment, email delivery or provider transaction has been performed during the local audit.
