import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ErrorEnvelopeSchema, type Role } from '@erp/contracts';
import { hashPassword } from '@erp/database';
import { call } from '@orpc/server';
import type { Response } from 'express';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { AuthController } from './auth.controller.js';
import { SESSION_COOKIE, verifySessionToken } from './session-token.js';
import { makeUser } from './test-user.js';

const secret = 'test-secret-that-is-at-least-32-characters';
const admin = makeUser('ADMINISTRATOR', { id: 'u1', email: 'admin@erp.local', name: 'Admin User' });

async function createController(findUnique = vi.fn()) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: PrismaService, useValue: { user: { findUnique } } },
      {
        provide: ConfigService,
        useValue: { get: (key: string) => (key === 'AUTH_SECRET' ? secret : 'test') },
      },
    ],
  }).compile();
  return moduleRef.get(AuthController);
}

function fakeResponse() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('AuthController', () => {
  let passwordHash: string;
  beforeAll(async () => {
    passwordHash = await hashPassword('password');
  });

  it('signs in and sets a signed session cookie', async () => {
    const controller = await createController(
      vi.fn().mockResolvedValue({ ...admin, passwordHash }),
    );
    const res = fakeResponse();

    await expect(
      call(controller.login(res), { email: 'Admin@erp.local', password: 'password' }),
    ).resolves.toEqual(admin);

    const [name, token, options] = res.cookie.mock.calls[0]!;
    expect(name).toBe(SESSION_COOKIE);
    expect(verifySessionToken(token, secret)).toBe('u1');
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax' });
  });

  it.each<{ email: string; role: Role; storeId: string | null }>([
    { email: 'admin@erp.local', role: 'ADMINISTRATOR', storeId: null },
    { email: 'purchasing@erp.local', role: 'PURCHASING_OFFICER', storeId: null },
    { email: 'store@erp.local', role: 'STORE_EMPLOYEE', storeId: 'store-01' },
    { email: 'manager@erp.local', role: 'MANAGER', storeId: null },
  ])('signs in demo account $email with role $role', async ({ email, role, storeId }) => {
    const user = { id: email, email, name: email, role, storeId };
    const controller = await createController(vi.fn().mockResolvedValue({ ...user, passwordHash }));

    const result = await call(controller.login(fakeResponse()), { email, password: 'password' });

    expect(result.role).toBe(role);
    expect(result.storeId).toBe(storeId);
  });

  it('gives a store employee a single assigned store and no store to others', async () => {
    const storeUser = makeUser('STORE_EMPLOYEE', {
      id: 'u2',
      email: 'store@erp.local',
      name: 'Store Employee',
    });
    const controller = await createController(
      vi.fn().mockResolvedValue({ ...storeUser, passwordHash }),
    );

    const result = await call(controller.login(fakeResponse()), {
      email: 'store@erp.local',
      password: 'password',
    });

    expect(result.storeId).toBe('store-01');
  });

  it('rejects a wrong password with the structured error envelope and no cookie', async () => {
    const controller = await createController(
      vi.fn().mockResolvedValue({ ...admin, passwordHash }),
    );
    const res = fakeResponse();

    const error = await call(controller.login(res), {
      email: 'admin@erp.local',
      password: 'wrong',
    }).catch((e) => e);

    expect(error.code).toBe('UNAUTHORIZED');
    const envelope = ErrorEnvelopeSchema.parse(error.data);
    expect(envelope.category).toBe('correct-input');
    expect(envelope.message).toMatch(/[\u0E00-\u0E7F]/); // contains Thai characters
    expect(JSON.stringify(error.data)).not.toMatch(/stack|prisma|at /i);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('rejects an unknown email with the structured error envelope', async () => {
    const controller = await createController(vi.fn().mockResolvedValue(null));

    const error = await call(controller.login(fakeResponse()), {
      email: 'nobody@erp.local',
      password: 'password',
    }).catch((e) => e);

    expect(error.code).toBe('UNAUTHORIZED');
    expect(ErrorEnvelopeSchema.safeParse(error.data).success).toBe(true);
  });

  it('clears the cookie on logout', async () => {
    const controller = await createController();
    const res = fakeResponse();

    await call(controller.logout(res), undefined);

    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.any(Object));
  });

  it('returns the current user, or null when signed out', async () => {
    const controller = await createController();

    await expect(call(controller.me(admin), undefined)).resolves.toEqual({ user: admin });
    await expect(call(controller.me(undefined), undefined)).resolves.toEqual({ user: null });
  });
});
