import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuthUserPayload {
  userId: number;
  username?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  /** The signed-in device; absent on a token issued before sessions existed. */
  sessionId?: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserPayload => {
    const request = ctx.switchToHttp().getRequest<{
      user: AuthUserPayload & { sub?: string | number };
    }>();
    const user = request.user;
    const rawId = user.userId ?? user.sub;
    return {
      userId: typeof rawId === 'number' ? rawId : Number(rawId),
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      sessionId: user.sessionId,
    };
  },
);
