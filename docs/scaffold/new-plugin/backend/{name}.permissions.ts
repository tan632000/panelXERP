/**
 * {NamePascal} plugin permissions — source of truth for seed validation.
 */
export const {name}Permissions = [
  '{name}:read',
  '{name}:write',
] as const;

export type {NamePascal}Permission = (typeof {name}Permissions)[number];
