import { type Role, roleHasPermission } from '@erp/contracts';
import { describe, expect, it } from 'vitest';
import { ensurePermission } from '../auth/permission.js';
import { makeUser } from '../auth/test-user.js';

/**
 * The master-data permission matrix at the API enforcement boundary. Every master-data write
 * (create/edit a store or supplier) and audit-log access require `master-data:manage`. This matrix
 * asserts the full role × permission grid — only an ADMINISTRATOR passes; every other role is
 * refused with the shared Thai error envelope — so a non-administrator can never create or edit a
 * store or supplier, nor read the audit log, regardless of what the UI shows.
 */
const ALL_ROLES: Role[] = ['ADMINISTRATOR', 'PURCHASING_OFFICER', 'STORE_EMPLOYEE', 'MANAGER'];
const ALLOWED_ROLE: Role = 'ADMINISTRATOR';

describe('master-data permission matrix (master-data:manage)', () => {
  for (const role of ALL_ROLES) {
    const allowed = role === ALLOWED_ROLE;

    it(`${allowed ? 'allows' : 'denies'} a ${role}`, () => {
      const run = () => ensurePermission(makeUser(role), 'master-data:manage');
      if (allowed) {
        expect(run).not.toThrow();
        expect(roleHasPermission(role, 'master-data:manage')).toBe(true);
      } else {
        expect(run).toThrow();
        expect(roleHasPermission(role, 'master-data:manage')).toBe(false);
      }
    });

    if (!allowed) {
      it(`rejects a ${role} with the FORBIDDEN error envelope (Thai, no leak)`, () => {
        const error = (() => {
          try {
            ensurePermission(makeUser(role), 'master-data:manage');
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
  }

  it('confirms exactly one role (ADMINISTRATOR) holds master-data:manage', () => {
    const holders = ALL_ROLES.filter((role) => roleHasPermission(role, 'master-data:manage'));
    expect(holders).toEqual([ALLOWED_ROLE]);
  });
});
