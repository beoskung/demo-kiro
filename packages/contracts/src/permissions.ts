import type { Role } from './auth.js';

/**
 * The permissions the API enforces. Each is a `<resource>:<action>` string.
 * This list grows as later tickets add features; the role matrix below is the single
 * source of truth for who may do what, enforced at the API (never by hiding UI alone).
 */
export type Permission =
  | 'master-data:manage'
  | 'purchase-order:submit'
  | 'purchase-order:approve'
  | 'goods-receipt:receive'
  | 'sale:record'
  | 'stock:adjust'
  | 'report:view';

/**
 * Which permissions each TOR role holds.
 *
 * Deliberate separations from the spec:
 * - An ADMINISTRATOR manages master data but has NO automatic transaction-approval right.
 * - A PURCHASING_OFFICER submits purchase orders but cannot approve them.
 * - Approval, stock adjustment, and cross-store reporting belong to the MANAGER.
 * - A STORE_EMPLOYEE receives goods and records sales for its own store only (see isStoreScoped).
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMINISTRATOR: ['master-data:manage', 'report:view'],
  PURCHASING_OFFICER: ['purchase-order:submit', 'report:view'],
  STORE_EMPLOYEE: ['goods-receipt:receive', 'sale:record', 'report:view'],
  MANAGER: ['purchase-order:approve', 'stock:adjust', 'report:view'],
};

/** Does the role hold the permission? */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Is a role bound to a single store? A STORE_EMPLOYEE is; a MANAGER and an ADMINISTRATOR
 * are organization-wide. Store-scoped roles may only act on their assigned store.
 */
export function isStoreScoped(role: Role): boolean {
  return role === 'STORE_EMPLOYEE';
}
