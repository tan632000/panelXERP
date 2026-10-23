export type ErpLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type ErpLogCategory = 'app' | 'error' | 'audit' | 'activity';

export type ErpLogStatus = 'success' | 'failed' | 'pending';

export interface ErpLogContext {
  [key: string]: unknown;
}

/** Input when emitting a log from services/interceptors */
export interface ErpLogInput {
  level?: Lowercase<ErpLogLevel> | ErpLogLevel;
  category?: ErpLogCategory;
  module?: string;
  action?: string;
  tenantId?: string;
  requestId?: string;
  traceId?: string;
  userId?: string | number;
  username?: string;
  targetType?: string;
  targetId?: string | number;
  status?: ErpLogStatus;
  message: string;
  errorCode?: string;
  durationMs?: number;
  ip?: string;
  context?: ErpLogContext;
}

/** Canonical JSON line written to file / S3 / CloudWatch */
export interface ErpLogEntry {
  timestamp: string;
  level: ErpLogLevel;
  service: string;
  environment: string;
  tenant_id?: string;
  module?: string;
  action?: string;
  request_id?: string;
  trace_id?: string;
  user_id?: string;
  username?: string;
  target_type?: string;
  target_id?: string;
  status?: ErpLogStatus;
  message: string;
  error_code?: string;
  duration_ms?: number;
  ip?: string;
  context?: ErpLogContext;
}

export interface ErpLogBuildOptions {
  service: string;
  environment: string;
  tenantId?: string;
  timezoneOffset?: string;
}

/** Minimal payload — request/user context is filled automatically */
export interface BusinessLogPayload {
  module: string;
  action: string;
  message: string;
  targetType?: string;
  targetId?: string | number;
  errorCode?: string;
  durationMs?: number;
  context?: ErpLogContext;
  userId?: string | number;
  username?: string;
}

export interface ErrorLogPayload extends BusinessLogPayload {
  error?: unknown;
}

export interface ActivityTrackPayload {
  module: string;
  action: string;
  message?: string;
  targetType?: string;
  targetId?: string | number;
  userId?: string | number;
  username?: string;
  context?: ErpLogContext;
}

export interface AuditRecordPayload {
  module?: string;
  action: string;
  targetType: string;
  targetId?: string | number;
  message?: string;
  errorCode?: string;
  status?: ErpLogStatus;
  context?: ErpLogContext;
}
