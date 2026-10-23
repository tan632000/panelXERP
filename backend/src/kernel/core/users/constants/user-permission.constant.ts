/**
 * Excel import and export of the account list. Own scopes so the permission matrix can show
 * them; the Function List still gives account administration (rows 1.x) to full system
 * access only, which holds them through the wildcard.
 */
export const USER_IMPORT = 'user:import' as const;
export const USER_EXPORT = 'user:export' as const;

export const userPermissions = [USER_IMPORT, USER_EXPORT] as const;
