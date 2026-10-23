import { RequestContextStore } from '@shared/context/request-context.store';

import type {
  ActivityTrackPayload,
  AuditRecordPayload,
  BusinessLogPayload,
  ErpLogBuildOptions,
  ErpLogCategory,
  ErpLogEntry,
  ErpLogInput,
  ErpLogLevel,
  ErpLogStatus,
  ErrorLogPayload,
} from '@shared/logger/erp-log.types';

const LEVEL_MAP: Record<string, ErpLogLevel> = {
  debug: 'DEBUG',
  verbose: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

export function normalizeLogLevel(level?: string): ErpLogLevel {
  if (!level) {
    return 'INFO';
  }
  return LEVEL_MAP[level.toLowerCase()] || 'INFO';
}

export function resolveLogCategory(input: ErpLogInput): ErpLogCategory {
  if (input.category) {
    return input.category;
  }
  return normalizeLogLevel(input.level) === 'ERROR' ? 'error' : 'app';
}

export function formatLogTimestamp(
  date = new Date(),
  timezoneOffset = '+07:00',
): string {
  const match = timezoneOffset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    return date.toISOString();
  }

  const sign = match[1] === '-' ? -1 : 1;
  const offsetMinutes =
    sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');

  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}.${pad(local.getUTCMilliseconds(), 3)}${timezoneOffset}`;
}

export function buildErpLogEntry(
  input: ErpLogInput,
  options: ErpLogBuildOptions,
): ErpLogEntry {
  const level = normalizeLogLevel(input.level);
  const entry: ErpLogEntry = {
    timestamp: formatLogTimestamp(new Date(), options.timezoneOffset),
    level,
    service: options.service,
    environment: options.environment,
    message: input.message,
  };

  const tenantId = input.tenantId || options.tenantId;
  if (tenantId) entry.tenant_id = tenantId;
  if (input.module) entry.module = input.module;
  if (input.action) entry.action = input.action;
  if (input.requestId) entry.request_id = input.requestId;
  if (input.traceId) entry.trace_id = input.traceId;
  if (input.userId !== undefined) entry.user_id = String(input.userId);
  if (input.username) entry.username = input.username;
  if (input.targetType) entry.target_type = input.targetType;
  if (input.targetId !== undefined) entry.target_id = String(input.targetId);
  if (input.status) entry.status = input.status;
  if (input.errorCode) entry.error_code = input.errorCode;
  if (input.durationMs !== undefined) entry.duration_ms = input.durationMs;
  if (input.ip) entry.ip = input.ip;
  if (input.context && Object.keys(input.context).length > 0) {
    entry.context = input.context;
  }

  return entry;
}

export function serializeErpLogEntry(entry: ErpLogEntry): string {
  return JSON.stringify(entry);
}

export function parseModuleFromPath(pathname: string): string {
  const segments = pathname
    .replace(/^\/api\/v\d+\/?/, '')
    .split('/')
    .filter(Boolean);
  return segments[0] || 'core';
}

export function buildHttpAction(method: string, pathname: string): string {
  const module = parseModuleFromPath(pathname);
  const resource = pathname
    .replace(/^\/api\/v\d+\/?/, '')
    .split('/')
    .filter(Boolean)
    .slice(1)
    .join('.')
    .replace(/\[.*?\]/g, 'id');

  if (!resource) {
    return `${module}.${method.toLowerCase()}`;
  }

  return `${module}.${resource}.${method.toLowerCase()}`;
}

function mergeRequestContext(
  payload: {
    userId?: string | number;
    username?: string;
    context?: Record<string, unknown>;
  },
  defaults: {
    level: ErpLogInput['level'];
    category: ErpLogCategory;
    status: ErpLogStatus;
  },
  fields: Omit<
    ErpLogInput,
    'level' | 'category' | 'status' | 'message' | 'context'
  > & {
    message: string;
    context?: Record<string, unknown>;
  },
): ErpLogInput {
  const ctx = RequestContextStore.get();

  return {
    ...defaults,
    ...fields,
    userId: payload.userId ?? ctx.userId,
    username: payload.username ?? ctx.username,
    requestId: ctx.requestId,
    traceId: ctx.traceId,
    ip: ctx.ip,
    context: payload.context
      ? { ...payload.context, ...fields.context }
      : fields.context,
  };
}

export function resolveSuccessLog(payload: BusinessLogPayload): ErpLogInput {
  return mergeRequestContext(
    payload,
    { level: 'info', category: 'app', status: 'success' },
    {
      module: payload.module,
      action: payload.action,
      message: payload.message,
      targetType: payload.targetType,
      targetId: payload.targetId,
      errorCode: payload.errorCode,
      durationMs: payload.durationMs,
      context: payload.context,
    },
  );
}

export function resolveWarnLog(payload: BusinessLogPayload): ErpLogInput {
  return mergeRequestContext(
    payload,
    { level: 'warn', category: 'app', status: 'pending' },
    {
      module: payload.module,
      action: payload.action,
      message: payload.message,
      targetType: payload.targetType,
      targetId: payload.targetId,
      errorCode: payload.errorCode,
      durationMs: payload.durationMs,
      context: payload.context,
    },
  );
}

export function resolveErrorLog(payload: ErrorLogPayload): ErpLogInput {
  const context: Record<string, unknown> = { ...(payload.context || {}) };

  if (payload.error instanceof Error) {
    context.error_name = payload.error.name;
    context.stack = payload.error.stack;
  } else if (payload.error !== undefined) {
    context.error = payload.error;
  }

  return mergeRequestContext(
    payload,
    { level: 'error', category: 'error', status: 'failed' },
    {
      module: payload.module,
      action: payload.action,
      message:
        payload.message ||
        (payload.error instanceof Error
          ? payload.error.message
          : 'Unexpected error'),
      targetType: payload.targetType,
      targetId: payload.targetId,
      errorCode: payload.errorCode,
      durationMs: payload.durationMs,
      context: Object.keys(context).length > 0 ? context : undefined,
    },
  );
}

export function resolveDebugLog(payload: BusinessLogPayload): ErpLogInput {
  return mergeRequestContext(
    payload,
    { level: 'debug', category: 'app', status: 'success' },
    {
      module: payload.module,
      action: payload.action,
      message: payload.message,
      targetType: payload.targetType,
      targetId: payload.targetId,
      context: payload.context,
    },
  );
}

export function resolveActivityLog(payload: ActivityTrackPayload): ErpLogInput {
  return mergeRequestContext(
    payload,
    { level: 'info', category: 'activity', status: 'success' },
    {
      module: payload.module,
      action: payload.action,
      message: payload.message || `Activity ${payload.action}`,
      targetType: payload.targetType || payload.module,
      targetId: payload.targetId,
      context: payload.context,
    },
  );
}

export function resolveAuditLog(payload: AuditRecordPayload): ErpLogInput {
  const status = payload.status || 'success';

  return mergeRequestContext(
    payload,
    {
      level: status === 'failed' ? 'error' : 'info',
      category: 'audit',
      status,
    },
    {
      module: payload.module,
      action: payload.action,
      message:
        payload.message || `Audit ${payload.action} on ${payload.targetType}`,
      targetType: payload.targetType,
      targetId: payload.targetId,
      errorCode: payload.errorCode,
      context: payload.context,
    },
  );
}

export function resolveHttpLog(input: {
  module: string;
  action: string;
  message: string;
  statusCode: number;
  durationMs?: number;
  context?: Record<string, unknown>;
}): ErpLogInput {
  const failed = input.statusCode >= 400;
  let level: 'error' | 'warn' | 'info';
  if (input.statusCode >= 500) level = 'error';
  else if (failed) level = 'warn';
  else level = 'info';

  return mergeRequestContext(
    {},
    {
      level,
      category: input.statusCode >= 500 ? 'error' : 'app',
      status: failed ? 'failed' : 'success',
    },
    {
      module: input.module,
      action: input.action,
      message: input.message,
      errorCode: failed ? `HTTP_${input.statusCode}` : undefined,
      durationMs: input.durationMs,
      context: input.context,
    },
  );
}
