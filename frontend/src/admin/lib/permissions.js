/**
 * Client-side mirror of the backend's role model.
 *
 * The API is the enforcement boundary: `AdminAuthGuard` + `RolesGuard` plus the
 * `@Roles(...)` decorators on each controller decide what actually happens.
 * This module only decides what the console *shows* — which link appears in the
 * sidebar and which button is enabled — so an operator never walks into a 403.
 * Keep `CAPABILITIES` in step with the decorators in
 * `backend/src/products/products.controller.ts` and
 * `backend/src/categories/categories.controller.ts`.
 */

/** Mirrors `AdminRole` in `backend/src/admin/admin.schema.ts`. */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  CATALOGUE_MANAGER: 'catalogue_manager',
  INVENTORY_MANAGER: 'inventory_manager',
  MARKETING_MANAGER: 'marketing_manager',
  SUPPORT: 'support',
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super admin',
  [ROLES.CATALOGUE_MANAGER]: 'Catalogue manager',
  [ROLES.INVENTORY_MANAGER]: 'Inventory manager',
  [ROLES.MARKETING_MANAGER]: 'Marketing manager',
  [ROLES.SUPPORT]: 'Support',
};

export const ROLE_OPTIONS = Object.values(ROLES);

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role ?? 'Unknown role';
}

/**
 * `super_admin` is intentionally absent from every entry: `RolesGuard` grants it
 * implicitly, and `can()` reproduces that rule in one place.
 */
export const CAPABILITIES = {
  'catalogue:read': [ROLES.CATALOGUE_MANAGER, ROLES.INVENTORY_MANAGER, ROLES.MARKETING_MANAGER, ROLES.SUPPORT],
  'catalogue:write': [ROLES.CATALOGUE_MANAGER],
  'categories:write': [ROLES.CATALOGUE_MANAGER],
  'inventory:read': [ROLES.CATALOGUE_MANAGER, ROLES.INVENTORY_MANAGER, ROLES.SUPPORT],
  // Adjustments touch stock balances, so they stay with inventory staff —
  // mirroring `PATCH /inventory/admin/adjust` (`SUPER_ADMIN` implicit).
  'inventory:write': [ROLES.INVENTORY_MANAGER],
  'orders:read': [ROLES.SUPPORT],
  'marketing:read': [ROLES.MARKETING_MANAGER],
  'audit:read': [],
};

export function can(role, capability) {
  if (!role) return false;
  if (role === ROLES.SUPER_ADMIN) return true;
  return (CAPABILITIES[capability] ?? []).includes(role);
}

/** Roles that hold a capability — used by the dashboard's access matrix. */
export function rolesFor(capability) {
  return [ROLES.SUPER_ADMIN, ...(CAPABILITIES[capability] ?? [])];
}
