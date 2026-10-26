import { oc } from '@orpc/contract';
import * as z from 'zod';
import { isStoreScoped } from './permissions.js';

/** The four TOR roles. Store scoping and permissions live in `permissions.ts`. */
export const RoleSchema = z.enum([
  'ADMINISTRATOR',
  'PURCHASING_OFFICER',
  'STORE_EMPLOYEE',
  'MANAGER',
]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * The signed-in user as the API exposes it (never includes the password hash).
 *
 * `storeId` is the user's store assignment: a STORE_EMPLOYEE is bound to exactly one store,
 * while a MANAGER and an ADMINISTRATOR are organization-wide and carry no store. The refinement
 * enforces that pairing so the contract itself rejects a mis-assigned identity.
 */
export const UserSchema = z
  .object({
    id: z.string(),
    email: z.email(),
    name: z.string(),
    role: RoleSchema,
    storeId: z.string().nullable().default(null),
  })
  .refine((user) => (isStoreScoped(user.role) ? user.storeId != null : user.storeId == null), {
    error: 'A store employee must have exactly one store; a manager and an administrator have none',
    path: ['storeId'],
  });
export type User = z.infer<typeof UserSchema>;

export const LoginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SessionSchema = z.object({
  user: UserSchema.nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

export const authContract = {
  login: oc
    .route({
      method: 'POST',
      path: '/auth/login',
      summary: 'Sign in with email and password',
      tags: ['Auth'],
    })
    .input(LoginInputSchema)
    .output(UserSchema),
  logout: oc.route({ method: 'POST', path: '/auth/logout', summary: 'Sign out', tags: ['Auth'] }),
  me: oc
    .route({
      method: 'GET',
      path: '/auth/me',
      summary: 'The signed-in user, or null',
      tags: ['Auth'],
    })
    .output(SessionSchema),
};
