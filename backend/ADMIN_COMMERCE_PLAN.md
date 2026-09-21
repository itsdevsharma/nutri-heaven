# Admin commerce architecture

## Goal

Build a secure, auditable administration system for the Nutri Heaven catalogue.
The admin UI is a separate `/admin` application area; it shares the NestJS API
with the storefront but never relies on client-side prices, stock, or roles.

## Delivery sequence

1. **Foundation and security** — Admin user schema, password hashing, JWT
   access/refresh tokens, role/permission guards, request validation,
   structured audit events, rate limiting and protected media uploads.
2. **Catalogue** — Categories, sub-categories, brands, products, media and
   variants. Products use soft-delete/status transitions; duplicate creates a
   new draft with fresh SKUs. Every write emits an audit event.
3. **Inventory** — Variant stock is changed only through immutable inventory
   movements (`opening`, `adjustment`, `order-reserved`, `order-committed`,
   `return`, `cancelled`). Mongo transactions prevent overselling. Low-stock
   and out-of-stock views are derived from variant stock and configured limits.
4. **Pricing and promotions** — Selling price, MRP and tax are represented in
   integer paise/basis points. Product, category and festival offers have
   priority, validity dates, status and stackability rules. A single pricing
   service decides the final checkout price.
5. **Coupons** — Rule-based coupons with percentage/flat discount, usage caps,
   expiry, minimum order, maximum saving and optional product/category scopes.
   Coupon redemptions are stored atomically at order placement.
6. **Admin UI** — Dashboard, catalogue editor, category tree, media picker,
   bulk price/stock actions, inventory history and adjustment screen, low-stock
   list, promotion/coupon editor and audit timeline. All destructive actions
   require confirmation and remain traceable.
7. **Orders and operations** — Idempotent order creation reserves stock;
   successful payment/COD confirmation commits it; cancellation restores it.
   Notifications are queued; not sent during the request.
8. **Hardening** — E2E tests for permissions, pricing, coupon scopes and
   stock concurrency; backups, monitoring, error tracking and CI/CD.

## Core data model

`Product`

- Identity: name, slug, brandId, categoryId, subCategoryId, SKU, barcode
- Content: short/full description, ordered product media, SEO title/description
- Commerce: status (`draft`, `active`, `inactive`, `archived`), featured,
  bestseller, new-arrival, tax rate basis points
- Variants: pack size/weight, SKU/barcode, MRP, selling price, stock quantity,
  low-stock limit, status and images

`Category`

- Name, slug, parentId for arbitrary-depth sub-categories, image, position,
  status and SEO fields. Deletion is soft; categories with live products cannot
  be hard deleted.

`InventoryMovement`

- Variant ID, signed quantity, resulting balance, movement type, reason,
  actor/admin ID, order/reference ID, idempotency key and timestamp.

`Offer` and `Coupon`

- Status, priority, date window, discount type/value, scope, minimum amount,
  maximum saving and usage constraints.

`AuditEvent`

- Actor, action, entity type/ID, before/after snapshots, request correlation
  ID and timestamp. Sensitive fields are redacted.

## API boundaries

- Public: active catalogue and server-side quote endpoints only.
- Admin: `/admin/auth/*`, `/admin/products/*`, `/admin/categories/*`,
  `/admin/inventory/*`, `/admin/offers/*`, `/admin/coupons/*`, all protected
  by RBAC. There will be no public `PATCH /products/admin/:slug` endpoint.
- Order writes use transactions and request idempotency keys.

## Non-negotiable rules

- Money is integer paise; percentages are integer basis points.
- Frontend input is never authoritative for price, discount, coupon result or
  inventory balance.
- Inventory is never directly decremented without a movement record.
- Product/category/coupon deletion is soft and auditable.
- Every admin operation is permission-checked and validates request DTOs.
