import { registerAs } from '@nestjs/config';

/**
 * The timezone scheduled work runs in.
 *
 * Distinct from `logging.timezoneOffset`, which only formats log lines: this one decides
 * when "08:00" and "today" happen for a business job, so a scan due each morning fires at
 * the factory's morning rather than at UTC's.
 */
export default registerAs('appTimezone', () => ({
  name: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
}));
