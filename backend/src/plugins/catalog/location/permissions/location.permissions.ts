export const LOCATION_READ = 'location:read' as const;
export const LOCATION_CREATE = 'location:create' as const;
export const LOCATION_UPDATE = 'location:update' as const;
export const LOCATION_DELETE = 'location:delete' as const;

export const locationPermissions = [
  LOCATION_READ,
  LOCATION_CREATE,
  LOCATION_UPDATE,
  LOCATION_DELETE,
] as const;
