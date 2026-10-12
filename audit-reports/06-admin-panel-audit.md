# Admin panel audit

Updated 2026-10-12 after implementation and reproducible local verification. The earlier baseline is preserved in `baseline-2026-10-12/`; it contains superseded findings.

Existing: products, categories, inventory, orders, promotions/coupons, CMS/settings, audit log, staff users and customers.

Added `/admin/insights` (super admin):
- Paid revenue, all orders, paid orders and customer counts.
- Last 30 days of daily paid sales, India timezone; zero-sale dates omitted.
- Top products by units; gross line values before order coupons/shipping.
- Published-product content flags linking directly to the editor.
- Latest 500 reviews with approve/reject controls.
- Latest 1,000 newsletter records including consent/confirmation status.
- Email configuration state and unsent queue count.

Orders now show a timeline and tracking number/link editing. Cancellation/refund rules are enforced server-side. Lists still have bounded latest-record limits for reviews/subscribers; larger operations would benefit from server pagination/export. After five mail attempts, investigation/requeue currently requires operator database tooling; no queue management UI is claimed.
