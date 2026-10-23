import { registerAs } from '@nestjs/config';

export type LogStorageMode = 'file' | 'stream';

function resolveStorageMode(): LogStorageMode {
  const mode = (process.env.LOG_STORAGE_MODE || 'file').toLowerCase();
  return mode === 'stream' ? 'stream' : 'file';
}

export default registerAs('logging', () => {
  const storageMode = resolveStorageMode();
  const isStreamMode = storageMode === 'stream';

  return {
    storageMode,
    isFileMode: !isStreamMode,
    isStreamMode,
    logDir: process.env.LOG_DIR || 'logs',
    level: process.env.LOG_LEVEL || 'debug',
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10),
    flushIntervalMs: parseInt(process.env.LOG_FLUSH_INTERVAL_MS || '60000', 10),
    cloudWatchEnabled:
      isStreamMode || process.env.AWS_CLOUDWATCH_ENABLED === 'true',
    cloudWatchAppGroup:
      process.env.AWS_CLOUDWATCH_LOG_GROUP ||
      `/erp/${process.env.NODE_ENV || 'development'}/app`,
    cloudWatchAuditGroup:
      process.env.AWS_CW_AUDIT_GROUP ||
      `/erp/${process.env.NODE_ENV || 'development'}/audit`,
    cloudWatchActivitiesGroup:
      process.env.AWS_CW_ACTIVITIES_GROUP ||
      `/erp/${process.env.NODE_ENV || 'development'}/activities`,
    s3LogBucket: process.env.AWS_S3_LOG_BUCKET || 'erp-logs',
    serviceName: process.env.LOG_SERVICE_NAME || 'erp-backend',
    timezoneOffset: process.env.LOG_TIMEZONE_OFFSET || '+07:00',
    tenantId: process.env.TENANT_ID || 'default',
  };
});
