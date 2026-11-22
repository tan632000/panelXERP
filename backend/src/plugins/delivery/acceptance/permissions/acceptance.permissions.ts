export const ACCEPTANCE_READ = 'acceptance:read' as const;
/** Upload the signed acceptance minutes: the order's sales owner, salesManager, director. */
export const ACCEPTANCE_CREATE = 'acceptance:create' as const;

export const acceptancePermissions = [
  ACCEPTANCE_READ,
  ACCEPTANCE_CREATE,
] as const;
