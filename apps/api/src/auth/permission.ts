import { type Permission, type User, isStoreScoped, roleHasPermission } from '@erp/contracts';
import { apiError } from './api-error.js';

/**
 * Enforce that the user's role holds the permission. Role (and store, below) is checked at the API
 * on every request — hiding a UI control is never the only protection. Rejections raise the shared
 * Thai error envelope (`FORBIDDEN`, category `correct-input`) with no stack trace or DB detail.
 */
export function ensurePermission(user: User, permission: Permission): void {
  if (!roleHasPermission(user.role, permission)) {
    throw apiError('FORBIDDEN', 'คุณไม่มีสิทธิ์ดำเนินการนี้');
  }
}

/**
 * Enforce that the user may act on `storeId`. A store-scoped role (STORE_EMPLOYEE) may only act on
 * its own assigned store; a MANAGER and an ADMINISTRATOR are organization-wide and may act on any.
 */
export function ensureStoreScope(user: User, storeId: string): void {
  if (isStoreScoped(user.role) && user.storeId !== storeId) {
    throw apiError('FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลของสาขานี้');
  }
}
