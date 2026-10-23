import { registerAs } from '@nestjs/config';

export type MailDriver = 'ses' | 'smtp';

/**
 * Transport for transactional mail. SES stays the default, but an environment with no SES
 * credentials — a self-hosted box, or a developer pointing at Mailtrap — only has to set
 * `SMTP_HOST` to switch: the driver follows the configuration that is actually present.
 */
function resolveDriver(): MailDriver {
  const explicit = process.env.MAIL_DRIVER?.trim().toLowerCase();
  if (explicit === 'ses' || explicit === 'smtp') return explicit;
  return process.env.SMTP_HOST ? 'smtp' : 'ses';
}

export default registerAs('mail', () => ({
  driver: resolveDriver(),
  /** Sender address for both drivers; `SES_FROM_EMAIL` stays valid so existing envs keep working. */
  from:
    process.env.MAIL_FROM_EMAIL ||
    process.env.SES_FROM_EMAIL ||
    'noreply@example.com',
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    /** Implicit TLS (port 465). Ports 587/2525 upgrade with STARTTLS instead. */
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
}));
