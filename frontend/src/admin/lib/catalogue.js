/**
 * Catalogue domain helpers shared by the console's pages.
 *
 * These read the shapes the NestJS API actually returns: a product carries a
 * `variants[]` array where each variant owns its own stock, and categories form
 * a tree through `parentId`. Keeping the derivations here means the dashboard,
 * inventory and product list cannot disagree about what "low stock" means.
 */

export const PRODUCT_STATUSES = ['draft', 'active', 'inactive', 'archived'];

/**
 * `tone` maps onto the pill/badge styles in `admin.css`; `hint` explains the
 * state's consequence, which is the part an operator actually needs.
 */
export const PRODUCT_STATUS_META = {
  draft: { label: 'Draft', tone: 'muted', hint: 'Not visible to customers yet' },
  active: { label: 'Active', tone: 'ok', hint: 'Live on the storefront' },
  inactive: { label: 'Inactive', tone: 'warn', hint: 'Hidden from the storefront' },
  archived: { label: 'Archived', tone: 'danger', hint: 'Retired and kept for history' },
};

export function productStatusMeta(status) {
  return PRODUCT_STATUS_META[status] ?? { label: status ?? 'Unknown', tone: 'muted', hint: '' };
}

/** Variants may predate a field, so every number is coerced defensively. */
function variantNumber(variant, key) {
  const value = Number(variant?.[key]);
  return Number.isFinite(value) ? value : 0;
}

/** Per-variant stock roll-up: balances, retail value and stock warnings. */
export function variantTotals(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.reduce(
    (totals, variant) => {
      const stock = variantNumber(variant, 'stockQuantity');
      const lowStockLimit = variantNumber(variant, 'lowStockLimit');
      totals.stock += stock;
      totals.valuePaise += stock * variantNumber(variant, 'pricePaise');
      if (stock === 0) totals.outOfStock += 1;
      else if (stock <= lowStockLimit) totals.lowStock += 1;
      return totals;
    },
    { stock: 0, valuePaise: 0, outOfStock: 0, lowStock: 0 },
  );
}

/**
 * Stock state for one variant. A variant with no stock at all is "out", and a
 * balance at or below its own low-stock limit is "low" — the backend models the
 * limit per variant, so it is never inferred from a global constant.
 */
export function variantStockState(variant) {
  const stock = variantNumber(variant, 'stockQuantity');
  const limit = variantNumber(variant, 'lowStockLimit');
  if (stock === 0) return { key: 'out', label: 'Out of stock', tone: 'danger' };
  if (stock <= limit) return { key: 'low', label: 'Low stock', tone: 'warn' };
  return { key: 'healthy', label: 'In stock', tone: 'ok' };
}

/** Counts per lifecycle state, always including zeroes for absent statuses. */
export function countByStatus(products = []) {
  const counts = Object.fromEntries(PRODUCT_STATUSES.map((status) => [status, 0]));
  products.forEach((product) => {
    const status = PRODUCT_STATUSES.includes(product?.status) ? product.status : 'draft';
    counts[status] += 1;
  });
  return counts;
}

/** Storefront assets are bare filenames (`almonds_ze0A.jpg`); URLs pass through. */
export function assetUrl(image) {
  if (!image) return '';
  const value = String(image);
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('/')) return value;
  return `/assets/${value}`;
}

function compareCategories(a, b) {
  const position = Number(a?.position ?? 0) - Number(b?.position ?? 0);
  if (position !== 0) return position;
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
}

/**
 * Arbitrary-depth tree from the flat `GET /categories/admin` payload. Orphaned
 * rows (a parent that was deactivated away or never loaded) are returned at the
 * root instead of being dropped, so nothing silently disappears from the page.
 */
export function buildCategoryTree(categories = []) {
  const byId = new Map(categories.map((category) => [String(category._id), { ...category, children: [] }]));
  const roots = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(String(node.parentId)) : null;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  });
  const sortRecursively = (nodes) => {
    nodes.sort(compareCategories);
    nodes.forEach((node) => sortRecursively(node.children));
    return nodes;
  };
  return sortRecursively(roots);
}

/**
 * Flat options for a parent `<select>`, each carrying its depth so the label can
 * be indented. `excludeId` removes a node and its whole subtree, which is what
 * stops an operator from making a category its own ancestor.
 */
export function categoryOptions(categories = [], { excludeId = null } = {}) {
  const tree = buildCategoryTree(categories);
  const options = [];
  const walk = (nodes, depth) => {
    nodes.forEach((node) => {
      if (node._id && String(node._id) === String(excludeId)) return;
      options.push({ id: String(node._id), name: node.name, depth, isActive: node.isActive !== false });
      walk(node.children, depth + 1);
    });
  };
  walk(tree, 0);
  return options;
}
