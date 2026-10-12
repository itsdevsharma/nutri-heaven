# Master feature checklist

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

| Area | Code | Local evidence | External requirement |
|---|---|---|---|
| Reset password | Resend adapter, reset screen, expiry, atomic consumption, revocation | Integration + real API browser | Verified sender and delivery |
| Account | Profile/address CRUD, default address, saved-address checkout | Integration + browser | None for implementation |
| Wishlist | Product/modal save and account remove | Browser | None |
| Catalogue | 24-item pages, server search/sort/category descendants | 55-product fixture + browser | Review real catalogue content |
| Notifications | Persistent inbox/read state, email outbox with retries | Integration + browser | Backend worker uptime and email provider |
| Orders | Ownership by customer ID, timeline, cancel, delivered return, tracking | Integration + real COD browser | Verified legacy order claim process if needed |
| Newsletter | Consent, double opt-in, unsubscribe, admin list | Integration + browser | Real inbox test; campaign sending not in scope |
| Reports | Paid sales, daily totals, top products, customers | Integration + browser | None for code |
| Reviews | Delivered purchase, one per product/customer, moderation | Integration | Editorial moderation |
| Documents | Escaped downloadable/printable HTML order receipt | Integration | Seller/tax details before tax invoice |
| Courier | Manual admin tracking and safe customer links | Code/build | Booking integration deferred by user |
| Deployment | Read-only smoke script | Script syntax/build | Execute against deployed origins |

Full ordered checklist and acceptance gates: [WEBSITE_COMPLETION.md](../docs/audits/WEBSITE_COMPLETION.md).
