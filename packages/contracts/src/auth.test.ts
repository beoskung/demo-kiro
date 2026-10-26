import { describe, expect, it } from 'vitest';
import { LoginInputSchema, RoleSchema, SessionSchema, UserSchema } from './auth.js';

describe('RoleSchema', () => {
  it('is exactly the four TOR roles', () => {
    expect(new Set(RoleSchema.options)).toEqual(
      new Set(['ADMINISTRATOR', 'PURCHASING_OFFICER', 'STORE_EMPLOYEE', 'MANAGER']),
    );
  });

  it('rejects a role that is no longer part of the vocabulary', () => {
    expect(RoleSchema.safeParse('ADMIN').success).toBe(false);
    expect(RoleSchema.safeParse('STAFF').success).toBe(false);
  });
});

describe('UserSchema store assignment', () => {
  const base = { id: '1', email: 'a@erp.local', name: 'A' };

  it('binds a store employee to exactly one store', () => {
    expect(
      UserSchema.safeParse({ ...base, role: 'STORE_EMPLOYEE', storeId: 'store-01' }).success,
    ).toBe(true);
  });

  it('rejects a store employee without a store', () => {
    expect(
      UserSchema.safeParse({ ...base, role: 'STORE_EMPLOYEE', storeId: null }).success,
    ).toBe(false);
    expect(UserSchema.safeParse({ ...base, role: 'STORE_EMPLOYEE' }).success).toBe(false);
  });

  it('treats a manager as organization-wide (no store)', () => {
    expect(UserSchema.safeParse({ ...base, role: 'MANAGER', storeId: null }).success).toBe(true);
    expect(UserSchema.safeParse({ ...base, role: 'MANAGER' }).success).toBe(true);
  });

  it('treats an administrator as organization-wide (no store)', () => {
    expect(UserSchema.safeParse({ ...base, role: 'ADMINISTRATOR', storeId: null }).success).toBe(
      true,
    );
  });

  it('rejects a manager that is bound to a store', () => {
    expect(
      UserSchema.safeParse({ ...base, role: 'MANAGER', storeId: 'store-01' }).success,
    ).toBe(false);
  });
});

describe('LoginInputSchema', () => {
  it('accepts an email and password', () => {
    const result = LoginInputSchema.safeParse({ email: 'admin@erp.local', password: 'password' });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = LoginInputSchema.safeParse({ email: 'admin', password: 'password' });

    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = LoginInputSchema.safeParse({ email: 'admin@erp.local', password: '' });

    expect(result.success).toBe(false);
  });
});

describe('SessionSchema', () => {
  it('accepts a signed-out session', () => {
    expect(SessionSchema.safeParse({ user: null }).success).toBe(true);
  });

  it('rejects an unknown role', () => {
    const result = SessionSchema.safeParse({
      user: { id: '1', email: 'a@erp.local', name: 'A', role: 'OWNER', storeId: null },
    });

    expect(result.success).toBe(false);
  });
});
