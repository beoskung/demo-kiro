import { describe, expect, it } from 'vitest';
import {
  type Permission,
  ROLE_PERMISSIONS,
  isStoreScoped,
  roleHasPermission,
} from './permissions.js';

describe('ROLE_PERMISSIONS matrix', () => {
  it('covers all four roles', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      ['ADMINISTRATOR', 'MANAGER', 'PURCHASING_OFFICER', 'STORE_EMPLOYEE'].sort(),
    );
  });

  it('gives an administrator master-data management but NOT transaction approval', () => {
    expect(roleHasPermission('ADMINISTRATOR', 'master-data:manage')).toBe(true);
    expect(roleHasPermission('ADMINISTRATOR', 'purchase-order:approve')).toBe(false);
  });

  it('lets a manager approve purchase orders', () => {
    expect(roleHasPermission('MANAGER', 'purchase-order:approve')).toBe(true);
  });

  it('lets a purchasing officer submit but not approve purchase orders', () => {
    expect(roleHasPermission('PURCHASING_OFFICER', 'purchase-order:submit')).toBe(true);
    expect(roleHasPermission('PURCHASING_OFFICER', 'purchase-order:approve')).toBe(false);
  });

  it('lets a store employee record sales and receive goods', () => {
    expect(roleHasPermission('STORE_EMPLOYEE', 'sale:record')).toBe(true);
    expect(roleHasPermission('STORE_EMPLOYEE', 'goods-receipt:receive')).toBe(true);
    expect(roleHasPermission('STORE_EMPLOYEE', 'purchase-order:approve')).toBe(false);
  });

  it('asserts at least one allowed and one denied permission per role', () => {
    const everyPermission: Permission[] = [
      'master-data:manage',
      'purchase-order:submit',
      'purchase-order:approve',
      'goods-receipt:receive',
      'sale:record',
      'stock:adjust',
      'report:view',
    ];
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      const allowed = everyPermission.filter((p) =>
        roleHasPermission(role as keyof typeof ROLE_PERMISSIONS, p),
      );
      const denied = everyPermission.filter(
        (p) => !roleHasPermission(role as keyof typeof ROLE_PERMISSIONS, p),
      );
      expect(allowed.length).toBeGreaterThanOrEqual(1);
      expect(denied.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('isStoreScoped', () => {
  it('scopes a store employee to its own store', () => {
    expect(isStoreScoped('STORE_EMPLOYEE')).toBe(true);
  });

  it('does not store-scope a manager or an administrator', () => {
    expect(isStoreScoped('MANAGER')).toBe(false);
    expect(isStoreScoped('ADMINISTRATOR')).toBe(false);
  });
});
