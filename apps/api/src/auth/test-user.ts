import type { Role, User } from '@erp/contracts';

/**
 * Build a {@link User} fixture for auth specs. A STORE_EMPLOYEE defaults to the `store-01`
 * assignment; every other role is organization-wide (no store), matching the contract's
 * store-assignment refinement. Pass `storeId` to override.
 */
export function makeUser(role: Role, overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: `${role.toLowerCase()}@erp.local`,
    name: role,
    role,
    storeId: role === 'STORE_EMPLOYEE' ? 'store-01' : null,
    ...overrides,
  };
}
