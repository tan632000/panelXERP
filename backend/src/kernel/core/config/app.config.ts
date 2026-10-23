import { registerAs } from '@nestjs/config';

const MIN_PRODUCTION_SECRET_LENGTH = 32;

/** Dev values published in `backend/.env.example` and `compose.yml`; long enough to pass the length check. */
const PUBLISHED_DEV_SECRETS = new Set([
  'dev-secret-key-change-in-production',
  'dev-refresh-secret-change-in-production',
]);

/**
 * Dev-only fallbacks are refused in production so a real secret is required, and so is a
 * placeholder copied from `.env.production.example` (`CHANGE_ME…`), a published dev value or a
 * guessable short value.
 */
export function resolveSecret(
  envVar: string,
  devFallback: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[envVar];
  if (env.NODE_ENV !== 'production') return value || devFallback;
  if (!value) {
    throw new Error(`${envVar} must be set in production.`);
  }
  if (
    value.toUpperCase().startsWith('CHANGE_ME') ||
    PUBLISHED_DEV_SECRETS.has(value) ||
    value.length < MIN_PRODUCTION_SECRET_LENGTH
  ) {
    throw new Error(
      `${envVar} must be a real secret of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
    );
  }
  return value;
}

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  name: process.env.APP_NAME || 'erp-api',
  displayName: process.env.APP_DISPLAY_NAME || 'ERP Platform API',
  tenantId: process.env.TENANT_ID || 'default',
  seedEmailDomain: process.env.SEED_EMAIL_DOMAIN || 'example.com',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  jwtSecret: resolveSecret('JWT_SECRET', 'dev-secret-key'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  jwtRefreshSecret: resolveSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  /**
   * Public origin of the web client. Reset-password mails carry an absolute link, and the
   * API has no other way to know which host the recipient opens the app on; `corsOrigin`
   * already names that host, so it is the fallback rather than a second value to keep in sync.
   */
  webAppUrl:
    process.env.APP_WEB_URL ||
    process.env.CORS_ORIGIN ||
    'http://localhost:3000',
  /** Minutes a password reset link stays usable after it is issued. */
  passwordResetTtlMinutes: parseInt(
    process.env.PASSWORD_RESET_TTL_MINUTES || '60',
    10,
  ),
}));
