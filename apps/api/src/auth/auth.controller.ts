import { Controller, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { contract, type User } from '@erp/contracts';
import { verifyPassword } from '@erp/database';
import { Implement, implement } from '@orpc/nest';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { apiError } from './api-error.js';
import { CurrentUser, Public } from './auth.decorators.js';
import { USER_SELECT } from './auth.guard.js';
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from './session-token.js';

@Controller()
@Public()
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: '/',
    };
  }

  @Implement(contract.auth.login)
  login(@Res({ passthrough: true }) res: Response) {
    return implement(contract.auth.login).handler(async ({ input }) => {
      const found = await this.prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
        select: { ...USER_SELECT, passwordHash: true },
      });
      if (!found || !(await verifyPassword(input.password, found.passwordHash))) {
        throw apiError('UNAUTHORIZED', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }

      const { passwordHash: _, ...user } = found;
      const token = createSessionToken(user.id, this.config.get('AUTH_SECRET', { infer: true }));
      res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions, maxAge: SESSION_TTL_MS });
      return user;
    });
  }

  @Implement(contract.auth.logout)
  logout(@Res({ passthrough: true }) res: Response) {
    return implement(contract.auth.logout).handler(() => {
      res.clearCookie(SESSION_COOKIE, this.cookieOptions);
    });
  }

  @Implement(contract.auth.me)
  me(@CurrentUser() user: User | undefined) {
    return implement(contract.auth.me).handler(() => ({ user: user ?? null }));
  }
}
