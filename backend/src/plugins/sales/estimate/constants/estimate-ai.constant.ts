/** Bull queue and job that fill an estimate draft from the documents of a request. */
export const ESTIMATE_AI_QUEUE = 'estimate-ai';
export const ESTIMATE_AI_JOB = 'prefill';

/**
 * A stalled job must fail outright: a second attempt would call the AI (and bill) again for a run
 * whose first attempt may already have written the draft.
 */
export const ESTIMATE_AI_QUEUE_SETTINGS = { maxStalledCount: 0 } as const;

/** Injection tokens for the settings and the client built from the `anthropic` config. */
export const ESTIMATE_AI_SETTINGS = Symbol('ESTIMATE_AI_SETTINGS');
export const ESTIMATE_AI_CLIENT = Symbol('ESTIMATE_AI_CLIENT');

/** Roles that may start or read a run; the administrator is refused on purpose. */
export const ESTIMATE_AI_ROLES: readonly string[] = [
  'sales',
  'salesManager',
  'director',
];

/** What one user may start: a rolling 24 hours. */
export const ESTIMATE_AI_DAILY_RUN_CAP = 20;
export const ESTIMATE_AI_TRIGGER_LIMIT = 5;
export const ESTIMATE_AI_TRIGGER_TTL_MS = 60_000;

/** A run still queued or running after this long is failed by the sweeper. */
export const ESTIMATE_AI_RUN_TIMEOUT_MS = 10 * 60_000;

/** The length of `technical_requirements` the request accepts. */
export const MAX_TECHNICAL_REQUIREMENTS_LENGTH = 10_000;
export const AI_REQUIREMENTS_PREFIX = '[AI] ';

export const ESTIMATE_AI_FILLED_EVENT = 'sales.estimate.ai_filled';
export const ESTIMATE_AI_FAILED_EVENT = 'sales.estimate.ai_failed';

/** `sales_estimate_ai_runs.error` is varchar(200). */
export const MAX_RUN_ERROR_LENGTH = 200;
