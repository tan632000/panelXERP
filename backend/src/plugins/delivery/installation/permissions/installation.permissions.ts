export const INSTALLATION_READ = 'installation:read' as const;
/** Create, edit, move and photograph an installation: storekeepers. */
export const INSTALLATION_MANAGE = 'installation:manage' as const;

export const installationPermissions = [
  INSTALLATION_READ,
  INSTALLATION_MANAGE,
] as const;
