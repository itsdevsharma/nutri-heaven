# Product Management Enhancement Implementation Plan

## Overview

This plan details the implementation for all outstanding product management features at `/admin/products`. The codebase is a React + Vite frontend talking to a NestJS/Mongoose backend. All money is integer paise, percentages are integer basis points, and **variant stock must only be changed through `/admin/inventory`** (immutable ledger).

---

## 1. Product Preview Before Publishing

**Goal:** Show exactly how the product will look on the storefront.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductEditorPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/admin.css` (new styles)

### Implementation:

1. **Create a `StorefrontPreview` component** that mirrors the storefront product card markup:
   - Primary image → thumbnail gallery
   - Title
   - Price (strike-through MRP if discount applies)
   - Category/sub-category badges
   - Flags (Featured, Bestseller, New Arrival)
   - Short description
   - Variant pack selector (dropdown of active variants)
   - "Add to cart" button (disabled — preview only)

2. **Live update** — the preview re-renders on every `form` change so operators see real-time results.

3. **Publishing checklist modal** — before allowing a switch to `Active`, validate:
   - Primary image present
   - At least one active variant with price > 0
   - SEO title/description non-empty (warn, not block)

4. **CSS additions:**
```css
.admin-storefront-preview {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px;
  background: var(--paper);
}
.admin-storefront-preview .sf-image {
  width: 100%; height: 200px; object-fit: contain; border-radius: var(--radius-sm);
}
.admin-storefront-preview .sf-price { font-size: 1.25rem; font-weight: 600; }
.admin-storefront-preview .sf-price strike { color: var(--muted); font-size: 0.85rem; }
```

### Backend changes:
None required — all preview data is available from the product record.

---

## 2. Image Reordering, Deleting, Thumbnail Selection, Crop/Alt-text

**Goal:** Full image management within the editor.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductEditorPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/components/Modal.jsx` (reuse)
- `/home/dev-sharma/Desktop/nutri/backend/src/products/product.schema.ts`

### Implementation:

1. **Image gallery grid** in the editor:
   - Each image rendered as a draggable tile (use `react-dnd` or HTML5 drag-and-drop).
   - Drag handle icon → reorder on drop.
   - Each tile has: thumbnail, "Make primary" toggle, "Edit alt-text" button, "Delete" button.

2. **Thumbnail selection** — clicking an image in the gallery sets `form.image` (primary). Visual indicator (star icon) on the current primary.

3. **Alt-text editor** — modal with text input per image, saved to `images[].alt` (backend change needed).

4. **Crop** — integrate a lightweight cropper (e.g., `react-easy-crop`). Since the backend stores bare filenames, the crop result is uploaded as a new asset via `adminApi.cms.uploadImage`, then replaces the original in the gallery.

### Backend changes:

Update `ProductSchema` to support structured images:
```ts
images: {
  type: [
    {
      url: { type: String, required: true },
      alt: { type: String, default: '' },
      position: { type: Number, default: 0 },
    },
  ],
  default: [],
}
```

Add migration: when loading a product, if `images` contains plain strings, convert to objects with `{ url, alt: product.title, position: index }`.

**API changes:**
- `PATCH /products/admin/:slug` already accepts the full payload — no new endpoint needed.

---

## 3. Category/Sub-category Dropdown Hierarchy

**Goal:** Proper hierarchical dropdown that validates against active categories.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductEditorPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/lib/catalogue.js`

### Implementation:

1. **Load categories** on editor mount using `adminApi.categories.list()` (already available).
2. **Build a hierarchical `<select>`** using `categoryOptions` from `catalogue.js` — already produces indented options with `depth`.
3. **Sub-category dropdown** — dependent on parent selection. Options are the children of the selected category.

### Code changes in `ProductEditorPage.jsx`:
```jsx
const { data: categoryData } = useResource(
  () => adminApi.categories.list(),
  [],
);

const categoryOptions = useMemo(() => {
  if (!categoryData) return [];
  return categoryOptions(categoryData);
}, [categoryData]);

const subCategoryOptions = useMemo(() => {
  if (!categoryData || !form.category) return [];
  const parent = categoryData.find(c => c.name === form.category);
  if (!parent) return [];
  return categoryData.filter(c => String(c.parentId) === String(parent._id));
}, [categoryData, form.category]);
```

### No backend changes needed.

---

## 4. Variant-Specific Images

**Goal:** Allow assigning images to specific variants.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductEditorPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/admin.css`
- `/home/dev-sharma/Desktop/nutri/backend/src/products/product.schema.ts` (schema already has `images` on variants)

### Implementation:

1. **Variant images field** — next to each variant row, add an "Images" button that opens a multi-select modal of the product's gallery. Selected images are saved to `variant.images[]`.

2. **Backend** — the schema already supports `variants[].images`. The DTO accepts the full payload, so sending `variant.images` in the PATCH body works.

3. **UI** — use a comma-separated input or checkbox list of gallery images per variant.

---

## 5. Bulk Operations

**Goal:** Select many products and apply actions (activate/deactivate/archive, change category, add tags, export CSV).

### Files to create:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/components/BulkActionBar.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/components/BulkActionMenu.jsx`

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductsPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/lib/api.js` (add bulk endpoints)
- `/home/dev-sharma/Desktop/nutri/backend/src/products/products.controller.ts`
- `/home/dev-sharma/Desktop/nutri/backend/src/products/products.service.ts`

### Implementation:

1. **Checkbox column** in the DataTable — add a header checkbox to select all on the current page.

2. **BulkActionBar** — appears when ≥1 product is selected, showing count and action buttons:
   - Activate / Deactivate / Archive
   - Change category (dropdown of active categories)
   - Add tags (comma-separated input)
   - Export selected as CSV

3. **BulkActionMenu** — a dropdown with destructive actions grouped under "Status" and "Data".

4. **Backend additions:**
```ts
// In ProductsController
@Patch('admin/bulk')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
async bulk(@Body() dto: BulkProductActionDto) {
  return this.productsService.bulkAction(dto);
}
```

```ts
// DTO
export class BulkProductActionDto {
  @IsEnum(BulkProductAction) action: BulkProductAction;
  @IsArray() @IsString() slugs: string[];
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsArray() @IsString() tags?: string[];
}

export enum BulkProductAction {
  activate = 'activate',
  deactivate = 'deactivate',
  archive = 'archive',
  changeCategory = 'changeCategory',
  addTags = 'addTags',
}
```

---

## 6. Import/Export Products (CSV / Excel)

### Files to create:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/components/CsvImportExport.jsx`

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductsPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/lib/api.js`
- `/home/dev-sharma/Desktop/nutri/backend/src/products/products.controller.ts`
- `/home/dev-sharma/Desktop/nutri/backend/src/products/products.service.ts`

### Implementation:

1. **Export CSV** — backend endpoint `GET /products/admin/export?status=...&q=...` returns a CSV stream. Frontend triggers download via `window.open`.

2. **Import CSV** — backend parses CSV, validates each row, returns `{ created, updated, errors: [{ row, message }] }`. Frontend shows summary in a modal before confirming.

3. **Frontend component** — file input + "Export current filter" button in the toolbar.

### Backend endpoints:
```ts
@Get('admin/export')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
exportCsv(@Query() query: ListAdminProductsQuery) { ... }

@Post('admin/import')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
importCsv(@UploadedFile() file, @Query() query) { ... }
```

---

## 7. Archive/Recover Workflow

**Goal:** Dedicated archive action and recover action.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/backend/src/products/products.controller.ts`
- `/home/dev-sharma/Desktop/nutri/backend/src/products/products.service.ts`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductsPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductEditorPage.jsx`

### Implementation:

1. **Archive in list** — add "Archive" button in row actions (visible when status is `active` or `inactive`).

2. **Recover in list** — when viewing "Archived" tab, each row gets "Recover" button → modal to choose target: `draft` or `inactive`.

3. **Recover in editor** — on archived product, show "Recover" button setting status to `draft` and `isActive: false`.

### Backend additions:
```ts
@Patch('admin/:slug/archive')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
adminArchive(@Param('slug') slug: string) {
  return this.productsService.adminSetStatus(slug, 'archived');
}

@Patch('admin/:slug/recover')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
adminRecover(@Param('slug') slug: string, @Body() body: { targetStatus: string }) {
  return this.productsService.adminRecover(slug, body.targetStatus);
}

async adminSetStatus(slug: string, status: Product['status']) {
  const product = await this.products.findOneAndUpdate(
    { slug },
    { $set: { status, isActive: status === 'active' } },
    { new: true },
  ).lean().exec();
  if (!product) throw new NotFoundException(`No product found for slug "${slug}"`);
  return product;
}

async adminRecover(slug: string, targetStatus: 'draft' | 'inactive') {
  const product = await this.products.findOneAndUpdate(
    { slug, status: 'archived' },
    { $set: { status: targetStatus, isActive: false } },
    { new: true },
  ).lean().exec();
  if (!product) throw new NotFoundException('Product not found or not archived');
  return product;
}
```
```

---

## 8. Enhanced List Filters

**Goal:** Category, stock status, featured/bestseller/new-arrival, price range.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductsPage.jsx`
- `/home/dev-sharma/Desktop/nutri/backend/src/products/dto/list-admin-products.query.ts`
- `/home/dev-sharma/Desktop/nutri/backend/src/products/products.service.ts`

---

## 9. Low-stock / Out-of-stock Shortcuts → Inventory

**Goal:** Quick links from ProductsPage to pre-filtered Inventory views.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductsPage.jsx`

### Implementation:

Add quick filter pills above the DataTable:
```jsx
<button onClick={() => navigate('/admin/inventory?view=low')}>
  Low stock
</button>

## 10. Stronger Product SEO

**Goal:** URL preview, character counters, meta preview, canonical URL.

### Files to modify:
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/pages/ProductEditorPage.jsx`
- `/home/dev-sharma/Desktop/nutri/frontend/src/admin/admin.css`

### Implementation:

1. **URL preview** — show full storefront URL below the slug field.
2. **Character counters** — next to seoTitle/seoDescription showing remaining characters.
3. **Meta preview card** — simulates Google search result snippet.
4. **Canonical URL** — read-only field displayed for reference.

## 11. Offer/Coupon Scheduling & Product-Level Promotions

**Goal:** Discount field exists, but no promotion lifecycle. Add offer scheduling.

### Files to create:
- `/frontend/src/admin/pages/OffersPage.jsx`
- `/backend/src/offers/offers.module.ts`, `offers.controller.ts`, `offers.service.ts`, `offer.schema.ts`
- `/backend/src/offers/dto/create-offer.dto.ts`

### Files to modify:
- `/frontend/src/admin/routes.jsx`
- `/frontend/src/admin/lib/api.js`

### Implementation:

## 12. Audit Trail

**Goal:** Who edited which product field and when.

### Files to create:
- `/frontend/src/admin/pages/AuditPage.jsx`
- `/backend/src/audit/audit.module.ts`, `audit.controller.ts`, `audit.service.ts`, `audit-event.schema.ts`

### Files to modify:
- `/frontend/src/admin/routes.jsx` — replace ComingSoonPage for `audit` route.
- `/backend/src/products/products.service.ts` — emit audit events after writes.

### Implementation:

1. **AuditEvent schema** — actor, action, entityType, entityId, before/after snapshots, correlationId.

## 13. Storefront Publishing Checks

**Goal:** Prevent activation if required data is missing.

### Files to modify:
- `/backend/src/products/products.service.ts`
- `/frontend/src/admin/pages/ProductEditorPage.jsx`

### Implementation:

1. **Server-side** — in `adminUpdate`, validate before allowing `status: 'active'`:
   - Primary image present
   - At least one active variant with price > 0
   - At least one variant with stock > 0
   - SEO title/description present (warn, not block)

## Summary of New Files

| Type | Path |
|------|------|
| Component | `/frontend/src/admin/components/BulkActionBar.jsx` |
| Component | `/frontend/src/admin/components/BulkActionMenu.jsx` |
| Component | `/frontend/src/admin/components/CsvImportExport.jsx` |
| Component | `/frontend/src/admin/components/StorefrontPreview.jsx` |
| Page | `/frontend/src/admin/pages/OffersPage.jsx` |
| Page | `/frontend/src/admin/pages/AuditPage.jsx` |
| Backend module | `/backend/src/offers/` (module, controller, service, schema, DTO) |
| Backend module | `/backend/src/audit/` (module, controller, service, schema) |

## Summary of Modified Files

| Type | Path |
|------|------|
| API client | `/frontend/src/admin/lib/api.js` |
| API client | `/frontend/src/admin/lib/catalogue.js` |
| Page | `/frontend/src/admin/pages/ProductsPage.jsx` |
| Page | `/frontend/src/admin/pages/ProductEditorPage.jsx` |
| Routes | `/frontend/src/admin/routes.jsx` |
| Styles | `/frontend/src/admin/admin.css` |
| Backend DTO | `/backend/src/products/dto/list-admin-products.query.ts` |
| Backend service | `/backend/src/products/products.service.ts` |
| Backend controller | `/backend/src/products/products.controller.ts` |
| Backend schema | `/backend/src/products/product.schema.ts` |

## Execution Order (Phased)

### Phase 1 — Foundation (1-2 weeks)
- Archive/recover endpoints
- Enhanced list filters (category, flags, stock state, price range)
- Low-stock/out-of-stock shortcuts

### Phase 2 — Editor Polish (1-2 weeks)
- Storefront preview component
- Image reordering/gallery UI
- Category dropdown hierarchy
- Variant-specific images
- SEO enhancements (URL preview, counters, meta preview)
- Publishing checks (server + client)

### Phase 3 — Bulk + Import/Export (1 week)
- Bulk operations
- CSV import/export

### Phase 4 — Commerce Modules (1-2 weeks)
- Offers/coupons scheduling
- Audit trail

Each phase is independently testable. The server-side publishing validation should go in Phase 2 to align with editor changes.
