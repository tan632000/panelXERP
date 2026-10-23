import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  AuthPrincipalCache,
  type AuthPrincipal,
} from '@kernel/core/auth/auth-principal-cache.service';
import { AuthService } from '@kernel/core/auth/auth.service';

/** Identity only — `validate` reloads role and permissions from the database. */
export interface JwtPayload {
  sub: string | number;
  username?: string;
  email?: string;
  role?: string;
  /** The signed-in device; absent on a token issued before sessions existed. */
  sid?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
    private readonly principalCache: AuthPrincipalCache,
  ) {
    const secret = configService.get<string>('app.jwtSecret');
    if (!secret) throw new Error('Missing JWT secret config');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid token');
    }

    const sessionId = typeof payload.sid === 'number' ? payload.sid : undefined;
    const cached = this.principalCache.get(userId, sessionId);
    // A copy, so a handler decorating `req.user` cannot leak into the next request.
    if (cached) return { ...cached };

    // A token naming a device is honoured only while that device is still signed in, so a
    // sign-out or revoke takes effect before access-token expiry.
    if (
      sessionId !== undefined &&
      !(await this.authService.isSessionLive(userId, sessionId))
    ) {
      throw new UnauthorizedException('Session has ended');
    }

    // Reload active user + permissions from DB so revoke/deactivate take effect
    // before access-token expiry; every such change evicts the cached principal.
    const profile = await this.authService.getProfile(userId);
    const principal: AuthPrincipal = {
      userId: profile.user.id,
      username: profile.user.username,
      email: profile.user.email,
      role: profile.user.role,
      permissions: profile.permissions,
      sessionId,
    };
    this.principalCache.set(userId, sessionId, principal);
    return { ...principal };
  }
}
