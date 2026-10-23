export interface AdminUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  /** A short-lived link to the account's transparent signature PNG, when one is on file. */
  signatureUrl?: string | null;
  /** A signature the holder submitted, waiting for an administrator's review. */
  pendingSignatureUrl?: string | null;
  signatureRequestedAt?: string | null;
  department?: string | null;
  title?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  roleCode: string | null;
  roleName: string | null;
}

export interface AssignableRole {
  id: number;
  code: string;
  name: string;
  description?: string | null;
}

export interface AdminUserListParams {
  page?: number;
  limit?: number;
  search?: string;
  roleCode?: string;
  isActive?: boolean;
  columnFilters?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
}

export interface CreateAdminUserDto {
  username: string;
  email: string;
  fullName: string;
  roleCode: string;
  password?: string;
  phone?: string | null;
  department?: string | null;
  title?: string | null;
  isActive?: boolean;
}

export type UpdateAdminUserDto = Partial<Omit<CreateAdminUserDto, "password">>;

/** The outcome of an accepted Excel import; an import only creates. */
export interface UserImportResult {
  created: number;
  updated: number;
}
