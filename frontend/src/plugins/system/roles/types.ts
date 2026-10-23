export interface SystemRole {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionGroup {
  /** Plugin that declared the scope, which is how the assignment screen groups its rows. */
  module: string;
  resource: string;
  permissions: string[];
}
