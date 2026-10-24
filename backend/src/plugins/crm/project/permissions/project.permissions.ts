export const PROJECT_READ = 'project:read' as const;
export const PROJECT_CREATE = 'project:create' as const;
export const PROJECT_UPDATE = 'project:update' as const;
export const PROJECT_DELETE = 'project:delete' as const;

export const projectPermissions = [
  PROJECT_READ,
  PROJECT_CREATE,
  PROJECT_UPDATE,
  PROJECT_DELETE,
] as const;
