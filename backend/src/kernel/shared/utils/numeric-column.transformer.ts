import type { ValueTransformer } from 'typeorm';

/**
 * `numeric`/`decimal` columns come back from `pg` as strings, not numbers, so every reader of
 * one of these columns (API response, internal service logic) gets `"1250"` instead of `1250`
 * unless the column carries this transformer. Without it, a client that expects a number (e.g.
 * `typeof value === "number"` guards) silently treats the value as absent.
 */
export const numericColumnTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : Number(value),
};
