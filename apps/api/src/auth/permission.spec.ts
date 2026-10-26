import { type Permission, type Role } from '@erp/contracts';
import { describe, expect, it } from 'vitest';
import { ensurePermission, ensureStoreScope } from './permission.js';
import { makeUser } from './test-user.js';

/**
 * The permission matrix at the enforcement boundary: each role gets at least one allowed and one
 * denied endpoint, proving the API — not hidden UI — is what rejects a caller.
 */
const matrix: Record<Role, { allowed: Permission; denied: Permission }> = {
  ADMINISTRATOR: { allowed: 'master-data:manage', denied: 'purchase-order:approve' },
  PURCHASING_OFFICER: { allowed: 'purchase-order:submit', denied: 'purchase-order:approve' },
  STORE_EMPLOYEE: { allowed: 'sale:record', denied: 'purchase-order:approve' },
  MANAGER: { allowed: 'purchase-order:approve', denied: 'master-data:manage' },
};

describe('ensurePermission', () => {
  for (const [role, { allowed, denied }] of Object.entries(matrix) as [
    Role,
    { allowed: Permission; denied: Permission },
  ][]) {
    it(`lets a ${role} call ${allowed}`, () => {
      expect(() => ensurePermission(makeUser(role), allowed)).not.toThrow();
    });

    it(`rejects a ${role} calling ${denied} with the envelope`, () => {
      const error = (() => {
        try {
          ensurePermission(makeUser(role), denied);
        } catch (e) {
          return e as { code: string; data: { category: string; message: string } };
        }
      })();

      expect(error?.code).toBe('FORBIDDEN');
      expect(error?.data.category).toBe('correct-input');
      expect(error?.data.message).toMatch(/[\u0E00-\u0E7F]/); // Thai message
      expect(JSON.stringify(error?.data)).not.toMatch(/stack|prisma|at /i);
    });
  }

  it('does NOT give an administrator automatic transaction approval', () => {
    expect(() => ensurePermission(makeUser('ADMINISTRATOR'), 'purchase-order:approve')).toThrow();
  });
});

describe('ensureStoreScope', () => {
  it('lets a store employee act on their own store', () => {
    expect(() => ensureStoreScope(makeUser('STORE_EMPLOYEE'), 'store-01')).not.toThrow();
  });

  it('rejects a store employee acting on another store with the envelope', () => {
    const error = (() => {
      try {
        ensureStoreScope(makeUser('STORE_EMPLOYEE'), 'store-02');
      } catch (e) {
        return e as { code: string; data: { category: string; message: string } };
      }
    })();

    expect(error?.code).toBe('FORBIDDEN');
    expect(error?.data.category).toBe('correct-input');
    expect(error?.data.message).toMatch(/[\u0E00-\u0E7F]/);
  });

  it('lets a manager act on any store (organization-wide)', () => {
    expect(() => ensureStoreScope(makeUser('MANAGER'), 'store-01')).not.toThrow();
    expect(() => ensureStoreScope(makeUser('MANAGER'), 'store-02')).not.toThrow();
  });

  it('lets an administrator act on any store (organization-wide)', () => {
    expect(() => ensureStoreScope(makeUser('ADMINISTRATOR'), 'store-99')).not.toThrow();
  });
});
