import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { matchesPermission } from '@kernel/core/auth/utils/permission-match.util';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ user: { permissions: string[] } }>();
    const { user } = req;
    const permissions: string[] = user?.permissions ?? [];

    return required.some((perm) => matchesPermission(permissions, perm));
  }
}
