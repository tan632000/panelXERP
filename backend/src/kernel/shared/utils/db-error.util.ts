import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function driverErrorOf(error: unknown): PostgresDriverError | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driverError = error.driverError as PostgresDriverError | undefined;
  return driverError?.code === UNIQUE_VIOLATION ? driverError : null;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return driverErrorOf(error) !== null;
}

/** The constraint Postgres named, or `null` when the error is not a unique violation. */
export function uniqueViolationConstraint(error: unknown): string | null {
  const driverError = driverErrorOf(error);
  if (!driverError) return null;
  return driverError.constraint?.toLowerCase() ?? '';
}

/** The `Key (...)=(...) already exists` line, for constraints Postgres leaves unnamed. */
export function uniqueViolationDetail(error: unknown): string | null {
  const driverError = driverErrorOf(error);
  if (!driverError) return null;
  return driverError.detail?.toLowerCase() ?? '';
}

export function isUniqueViolationOn(
  error: unknown,
  constraints: readonly string[],
): boolean {
  const constraint = uniqueViolationConstraint(error);
  return constraint !== null && constraints.includes(constraint);
}

export interface UniqueConflictRule {
  /** Matched against the constraint name and the detail line, both lowercased. */
  matches: readonly string[];
  message: string;
}

/** `undefined` when no rule matches, so the caller decides what an unknown collision means. */
export function uniqueViolationConflict(
  error: unknown,
  rules: readonly UniqueConflictRule[],
): ConflictException | undefined {
  const constraint = uniqueViolationConstraint(error);
  if (constraint === null) return undefined;

  const detail = uniqueViolationDetail(error) ?? '';
  for (const rule of rules) {
    const hit = rule.matches.some(
      (token) => constraint.includes(token) || detail.includes(token),
    );
    if (hit) return new ConflictException(rule.message);
  }
  return undefined;
}

export interface GeneratedCodeRetryOptions {
  /** Indexes over a generated code. An empty list disables retrying. */
  retryOn: readonly string[];
  exhaustedMessage: string;
  maxAttempts?: number;
  /** Applied before deciding to retry, so a known collision reports instead of looping. */
  conflictRules?: readonly UniqueConflictRule[];
}

/**
 * Saves a row whose code is generated, letting `save` produce the next code each attempt.
 *
 * Retrying only on `retryOn` matters: a code is read from the highest one in use, so a
 * concurrent create takes the same number and the loser needs another go. Retrying on any
 * violation instead spends every attempt on a conflict it cannot resolve — a duplicate name,
 * say — then rethrows the driver error, which reaches the client as a 500.
 */
export async function saveWithGeneratedCode<T>(
  save: (attempt: number) => Promise<T>,
  options: GeneratedCodeRetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await save(attempt);
    } catch (error: unknown) {
      const conflict = options.conflictRules
        ? uniqueViolationConflict(error, options.conflictRules)
        : undefined;
      if (conflict) throw conflict;

      if (!isUniqueViolationOn(error, options.retryOn)) throw error;
      if (attempt < maxAttempts) continue;
      throw new ConflictException(options.exhaustedMessage);
    }
  }

  throw new ConflictException(options.exhaustedMessage);
}

/**
 * Reports a lost race in the words the author would have seen.
 *
 * The pre-checks all run before the insert, so reaching the constraint means a concurrent
 * write took the value; re-running the check now finds it. When it does not, the driver
 * error stands rather than being swallowed.
 */
export async function rethrowUniqueViolation(
  error: unknown,
  recheck: () => void | Promise<void>,
): Promise<never> {
  if (isPostgresUniqueViolation(error)) await recheck();
  throw error;
}
