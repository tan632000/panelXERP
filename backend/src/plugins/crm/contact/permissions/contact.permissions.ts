export const CONTACT_READ = 'contact:read' as const;
export const CONTACT_CREATE = 'contact:create' as const;
export const CONTACT_UPDATE = 'contact:update' as const;
export const CONTACT_DELETE = 'contact:delete' as const;

export const contactPermissions = [
  CONTACT_READ,
  CONTACT_CREATE,
  CONTACT_UPDATE,
  CONTACT_DELETE,
] as const;
