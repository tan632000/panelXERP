import { In, Raw } from 'typeorm';

/** Escape LIKE metacharacters so user input matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Case-insensitive equality. `ILike(value)` would treat `%` and `_` in user
 * input as wildcards, so "VT_0007" collides with "VT-0007".
 */
export function caseInsensitiveEquals(value: string) {
  return Raw((alias) => `LOWER(${alias}) = LOWER(:value)`, { value });
}

let unaccentParamSeq = 0;

/**
 * Case- and accent-insensitive ILIKE: `erp_unaccent` strips Vietnamese tone marks on both
 * sides, so a word typed with the new-style mark placement finds the old-style spelling, and a
 * query typed without marks finds both.
 * Each call binds its own parameter name, so several patterns can share one find query.
 */
export function unaccentILike(pattern: string) {
  unaccentParamSeq = (unaccentParamSeq + 1) % 1_000_000;
  const param = `unaccentPattern${unaccentParamSeq}`;
  return Raw(
    (alias) => `erp_unaccent(${alias}) ILIKE erp_unaccent(:${param})`,
    { [param]: pattern },
  );
}

/** Case- and accent-insensitive "contains" search with LIKE metacharacters escaped. */
export function ilikeContains(search: string) {
  return unaccentILike(`%${escapeLikePattern(search)}%`);
}

/** An enum column plus the values a localized keyword resolved to. */
interface EnumSearchMatch {
  field: string;
  values?: string[];
}

/**
 * Build OR-where clauses for ILIKE search across multiple fields.
 *
 * `enumMatch` adds one more branch for a classification column: it stores an English enum, so a
 * keyword typed in the UI language is resolved to enum values by the client and matched exactly.
 */
export function buildIlikeOrWhere(
  base: Record<string, unknown>,
  fields: string[],
  search?: string,
  enumMatch?: EnumSearchMatch,
): Record<string, unknown> | Array<Record<string, unknown>> {
  const keyword = search?.trim();
  const enumValues = enumMatch?.values?.filter(Boolean) ?? [];

  if (!keyword && enumValues.length === 0) {
    return base;
  }

  const branches: Array<Record<string, unknown>> = [];

  if (keyword) {
    const pattern = `%${escapeLikePattern(keyword)}%`;
    branches.push(
      ...fields.map((field) => ({
        ...base,
        [field]: unaccentILike(pattern),
      })),
    );
  }

  if (enumMatch && enumValues.length > 0) {
    branches.push({ ...base, [enumMatch.field]: In(enumValues) });
  }

  return branches;
}
