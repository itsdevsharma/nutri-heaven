# Security Audit

## Summary

The repository has several positive security controls in code, including JWT-based admin auth, bcrypt password hashing, role-based guards, validation pipes, and Razorpay webhook signature verification. However, the app is not yet production-hardening complete. The current audit found no evidence of a verified production environment, rate limiting, TLS enforcement, backup/restore testing, dependency scanning, or hardened deployment configuration.

## Authentication findings

- Status: PARTIAL
- Evidence: [backend/src/auth/auth.module.ts](../backend/src/auth/auth.module.ts), [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts), [backend/src/admin/admin.schema.ts](../backend/src/admin/admin.schema.ts)
- Strength: admin authentication exists and uses bcryptjs and JWT.
- Gap: no evidence of password reset lockout, MFA, or production secret rotation process.
- Impact: account compromise risk if production envs are misconfigured.
- Remediation: define password policy, reset flow, lockout, and rotation in production.
- Verification: test login/logout/invalid credentials and production secret rotation.

## Authorization findings

- Status: PARTIAL
- Evidence: [backend/src/auth/roles.guard.ts](../backend/src/auth/roles.guard.ts), [backend/src/auth/admin-auth.guard.ts](../backend/src/auth/admin-auth.guard.ts)
- Strength: admin authorization and role checks are enforced.
- Gap: role matrix and auditability for the full admin workflow are not yet proven complete.
- Impact: unauthorized admin actions could be harder to constrain without proper policy enforcement.
- Remediation: document approved roles and enforce a stricter permission matrix.
- Verification: execute unauthorized access and role boundary tests.

## Admin permission findings

- Status: PARTIAL
- Evidence: [frontend/src/admin/routes.jsx](../frontend/src/admin/routes.jsx), [backend/src/admin/admin.schema.ts](../backend/src/admin/admin.schema.ts)
- Strength: admin app has route capability mapping.
- Gap: no final RBAC matrix matching the actual operational roles is demonstrated.
- Impact: inconsistent or excessive responsibilities can be assigned.
- Remediation: align roles with business approval and enforce at API level.
- Verification: test each role against its allowed actions.

## API security findings

- Status: PASS with gaps
- Evidence: [backend/src/main.ts](../backend/src/main.ts)
- Strength: `ValidationPipe` with whitelist and forbidding unknown fields is enabled.
- Gap: no explicit rate limiting or request-size guard was evidenced.
- Impact: brute force and abuse risk.
- Remediation: add rate limiting and request guardrails.
- Verification: repeated auth failures and high-volume requests.

## Input validation findings

- Status: PASS
- Evidence: [backend/src/main.ts](../backend/src/main.ts), [backend/src/payments/payments.dto.ts](../backend/src/payments/payments.dto.ts)
- Strength: DTO validation is enforced globally and payment verification uses explicit pattern validation.
- Gap: not all endpoints were audited in full for mass-assignment and object-level authorization.
- Impact: partially controlled API surfaces can still expose gaps.
- Remediation: audit each DTO and controller for object-level checks.
- Verification: negative API tests on each critical write endpoint.

## Database security findings

- Status: PARTIAL
- Evidence: [backend/src/app.module.ts](../backend/src/app.module.ts), [backend/docker-compose.yml](../backend/docker-compose.yml)
- Strength: local MongoDB is isolated in dev and the app uses a MongoDB URI abstraction.
- Gap: no proof of authentication, encryption at rest, backups, or recovery testing for production-level database deployment.
- Impact: data confidentiality and integrity risk.
- Remediation: use managed database with auth and backups; test failover and restore.
- Verification: check deployment environment and restore drills.

## Session and token handling

- Status: PARTIAL
- Evidence: [backend/src/auth/auth.module.ts](../backend/src/auth/auth.module.ts), [backend/src/admin/admin.schema.ts](../backend/src/admin/admin.schema.ts)
- Strength: JWT tokens and admin authVersion invalidation are present.
- Gap: customer session expiry and access token rotation are not fully validated.
- Impact: stale session risk.
- Remediation: confirm refresh token strategy and session expiry policy.
- Verification: cross-device logout and token expiry tests.

## Payment verification

- Status: PARTIAL
- Evidence: [backend/src/payments/payments.service.ts](../backend/src/payments/payments.service.ts)
- Strength: Razorpay signature and amount/order checks exist.
- Gap: live gateway verification with real credentials is not currently available, and no sandbox transaction evidence exists.
- Impact: payment integrity risk until the real provider flow is tested.
- Remediation: use sandbox credentials and verify every payment state transition.
- Verification: successful, failed, cancelled, duplicate, and amount-mismatch scenarios.

## Webhook validation

- Status: PARTIAL
- Evidence: [backend/src/payments/payments.service.ts](../backend/src/payments/payments.service.ts)
- Strength: webhook signature validation is implemented using HMAC timing-safe comparison.
- Gap: live webhook tests are not available, and the app has not been proven resilient to duplicate or malicious payloads.
- Impact: duplicate order or payment edge cases remain a risk.
- Remediation: verify webhook idempotency and replay behavior in a real sandbox environment.
- Verification: replay captured, failed, duplicate, and invalid-signature webhooks.

## File upload security

- Status: PARTIAL
- Evidence: [backend/src/media/media.controller.ts](../backend/src/media/media.controller.ts)
- Strength: file upload validation checks for image signature and type.
- Gap: no far-reaching abuse testing or production secure storage verification was found.
- Impact: upload abuse or malicious file risk remains until environment is hardened.
- Remediation: review quotas, storage bucket permissions, and malware scanning.
- Verification: upload invalid files and confirm rejection plus storage policy.

## Dependency vulnerabilities

- Status: UNVERIFIED
- Evidence: package manifests and installed dependencies
- Gap: no dependency scan, SCA report, or security update review was performed.
- Impact: known vulnerabilities may exist in dependencies.
- Remediation: run a dependency audit and update vulnerable packages.
- Verification: `pnpm audit` and a dependency review across frontend/backend packages.

## Secret management

- Status: MISSING / not verified
- Evidence: [backend/src/main.ts](../backend/src/main.ts), [backend/src/auth/auth.module.ts](../backend/src/auth/auth.module.ts)
- Gap: no production secret manager or rotation plan was identified.
- Impact: production credential leakage risk.
- Remediation: move secrets to a managed secret store; rotate defaults and test env isolation.
- Verification: production deployment checklist and secret scanning.

## Data exposure risks

- Status: PARTIAL
- Evidence: app code and admin data handling
- Gap: no verified customer-data minimization, audit log restriction, or production logging review.
- Impact: privacy and data leakage risk.
- Remediation: enforce least privilege and redaction in logs.
- Verification: log review on auth and payment events.

## Logging risks

- Status: PARTIAL
- Evidence: backend logs and audit code
- Gap: no full review of log content or external log integration.
- Impact: sensitive information could leak.
- Remediation: redact tokens, raw payment data, and customer info.
- Verification: inspect logs for secret leakage and configure log retention policy.

## Security headers

- Status: PASS
- Evidence: [backend/src/main.ts](../backend/src/main.ts)
- Strength: the app includes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Gap: CSP and HSTS are not fully documented as production hardened.
- Impact: browser-level hardening remains incomplete.
- Remediation: add CSP and HSTS in a reverse-proxy or app deployment config.
- Verification: test headers in production/staging server responses.

## Backup and recovery considerations

- Status: MISSING
- Evidence: deployment and infrastructure docs
- Gap: no evidence of database backups, runbooks, or restoration tests.
- Impact: catastrophic operational risk.
- Remediation: implement automated backups and restore drills.
- Verification: execute a non-destructive restore rehearsal.

## Overall security verdict

The app has a reasonable starting security foundation, but it is not ready for production without hardening and verified deployment controls. The current risk level should be treated as medium-to-high until live provider access, backups, secret controls, and security tests are completed.
