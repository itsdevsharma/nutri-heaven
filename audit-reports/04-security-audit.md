# Security audit

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

Verified locally:
- DTO validation rejects invalid limits, review values, missing newsletter consent and unknown fields.
- Customer ID ownership protects order history, cancellation, return requests, receipts and review eligibility. Cross-customer requests reject access.
- Notification read updates are scoped to the authenticated recipient; address mutations are scoped to customer ID.
- Reviews appear publicly only when approved; customer IDs/emails are not projected publicly.
- Password reset tokens are hashed, expire in 15 minutes and are atomically consumed; session version changes invalidate old tokens.
- Receipt HTML escapes customer and product strings; tracking links require HTTP(S).
- Resend keys are server-only. Email provider failure messages avoid exposing response secrets.
- Admin reporting, newsletter data and moderation require super-admin privileges.

Limits requiring release review:
- Rate limiting is per process, not distributed; customer signup/login need deployment-level abuse protection.
- Email ownership verification and guest/legacy order claim are not implemented. New account orders are bound by authenticated ID instead of guessed email.
- Customer JWT remains in localStorage as in the existing application; HttpOnly cookie/session migration is separate hardening work.
- Backup restoration, TLS, production secrets and monitoring need deployment evidence.
- Review approved policy copy and retention of customer notification/order data before launch.
