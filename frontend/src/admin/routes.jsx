import ComingSoonPage from './pages/ComingSoonPage.jsx';
import CategoriesPage from './pages/CategoriesPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProductEditorPage from './pages/ProductEditorPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import StoreContentPage from './pages/StoreContentPage.jsx';
import CmsCollectionsPage from './pages/CmsCollectionsPage.jsx';

/**
 * The console's route table — the single source of truth for three things that
 * would otherwise drift apart: the router (`matchRoutes`), the sidebar
 * (`navRoutes`) and the access rules (`capability`).
 *
 * `capability` is a key from `lib/permissions.js`, which mirrors the `@Roles(...)`
 * decorators on the NestJS controllers. A route without a capability is open to
 * any signed-in admin; `public: true` means no session at all (login only).
 *
 * Adding a screen is therefore one entry here plus its component — no changes to
 * the router, the layout or the permission map.
 */
export const ROUTES = [
  {
    id: 'login',
    path: '/admin/login',
    title: 'Sign in',
    public: true,
    element: LoginPage,
  },
  { id:'cms-banners', path:'/admin/banners', title:'Banners', label:'Banners', group:'Marketing', icon:'▧', capability:'settings:write', element:CmsCollectionsPage },
  { id:'cms-faqs', path:'/admin/faqs', title:'FAQs', label:'FAQs', group:'Marketing', icon:'?', capability:'settings:write', element:CmsCollectionsPage },
  { id:'cms-socials', path:'/admin/socials', title:'Social links', label:'Social links', group:'Marketing', icon:'@', capability:'settings:write', element:CmsCollectionsPage },
  {
    id: 'dashboard',
    path: '/admin',
    title: 'Dashboard',
    label: 'Dashboard',
    group: 'Overview',
    icon: '◧',
    capability: 'catalogue:read',
    element: DashboardPage,
  },
  {
    id: 'products',
    path: '/admin/products',
    title: 'Products',
    label: 'Products',
    group: 'Catalogue',
    icon: '▤',
    capability: 'catalogue:read',
    element: ProductsPage,
  },
  {
    id: 'product-new',
    path: '/admin/products/new',
    title: 'New product',
    capability: 'catalogue:write',
    element: ProductEditorPage,
    hidden: true,
  },
  {
    id: 'product-edit',
    path: '/admin/products/:slug',
    title: 'Edit product',
    capability: 'catalogue:read',
    element: ProductEditorPage,
    hidden: true,
  },
  {
    id: 'categories',
    path: '/admin/categories',
    title: 'Categories',
    label: 'Categories',
    group: 'Catalogue',
    icon: '⌸',
    capability: 'catalogue:read',
    element: CategoriesPage,
  },
  {
    id: 'store-content',
    path: '/admin/store-content',
    title: 'Store content',
    label: 'Store content',
    group: 'System',
    icon: '¶',
    capability: 'settings:write',
    element: StoreContentPage,
  },
  {
    id: 'inventory',
    path: '/admin/inventory',
    title: 'Inventory',
    label: 'Inventory',
    group: 'Operations',
    icon: '▦',
    capability: 'inventory:read',
    element: InventoryPage,
  },
  {
    id: 'orders',
    path: '/admin/orders',
    title: 'Orders',
    label: 'Orders',
    group: 'Operations',
    icon: '▣',
    capability: 'orders:read',
    element: OrdersPage,
  },
  {
    id: 'offers',
    path: '/admin/offers',
    title: 'Offers',
    label: 'Offers',
    group: 'Marketing',
    icon: '◆',
    capability: 'marketing:read',
    element: ComingSoonPage,
    planned: {
      summary: 'Product, category and festival offers with priority, validity windows and stackability rules.',
      phase: 'Step 4 of backend/ADMIN_COMMERCE_PLAN.md (pricing and promotions).',
      bullets: [
        'Integer basis-point discounts with date windows and an explicit priority order.',
        'Scopes limited to chosen products or categories, with a maximum saving cap.',
        'One pricing service decides the final checkout price, so no screen can overrule it.',
      ],
      endpoints: ['GET /admin/offers', 'POST /admin/offers', 'PATCH /admin/offers/:id', 'PATCH /admin/offers/:id/deactivate'],
    },
  },
  {
    id: 'coupons',
    path: '/admin/coupons',
    title: 'Coupons',
    label: 'Coupons',
    group: 'Marketing',
    icon: '◈',
    capability: 'marketing:read',
    element: ComingSoonPage,
    planned: {
      summary: 'Rule-based coupons with usage caps, expiry and optional product or category scopes.',
      phase: 'Step 5 of backend/ADMIN_COMMERCE_PLAN.md (coupons).',
      bullets: [
        'Percentage or flat discounts with a minimum order and a maximum saving.',
        'Redemption counters stored atomically when an order is placed.',
        'Publish and unpublish without deleting history, so past redemptions stay explainable.',
      ],
      endpoints: [
        'GET /admin/coupons',
        'POST /admin/coupons',
        'PATCH /admin/coupons/:id',
        'GET /admin/coupons/:id/redemptions',
      ],
    },
  },
  {
    id: 'audit',
    path: '/admin/audit',
    title: 'Audit trail',
    label: 'Audit trail',
    group: 'System',
    icon: '≡',
    capability: 'audit:read',
    element: ComingSoonPage,
    planned: {
      summary: 'Who changed what, before and after, with the request that caused it.',
      phase: 'Audit events land in step 1 of backend/ADMIN_COMMERCE_PLAN.md and are consumed from step 6 on.',
      bullets: [
        'Actor, action, entity type and id, with redacted before/after snapshots.',
        'A correlation id so a change can be traced back to the request that made it.',
        'Every catalogue and inventory write emits one — this screen is where they surface.',
      ],
      endpoints: ['GET /admin/audit', 'GET /admin/audit/:entityType/:entityId'],
    },
  },
];

/** Sidebar order; a group whose routes are all out of reach is skipped entirely. */
export const NAV_GROUP_ORDER = ['Overview', 'Catalogue', 'Operations', 'Marketing', 'System'];

/** Entries that appear in the sidebar (hidden routes are reachable by URL only). */
export const navRoutes = ROUTES.filter((route) => route.label && !route.hidden);

export function routeById(id) {
  return ROUTES.find((route) => route.id === id) ?? null;
}
