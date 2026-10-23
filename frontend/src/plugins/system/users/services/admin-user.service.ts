import api from "@/kernel/core/api/api";

import { adminUserApiRoutes } from "@plugins/system/users/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  AdminUser,
  AdminUserListParams,
  AssignableRole,
  CreateAdminUserDto,
  UpdateAdminUserDto,
  UserImportResult,
} from "@plugins/system/users/types";
import type { UserImportDocument } from "@plugins/system/users/utils/parse-user-import-rows";

export async function getAdminUsers(
  params: AdminUserListParams = {},
): Promise<PaginatedResponse<AdminUser>> {
  const { data } = await api.get<PaginatedResponse<AdminUser>>(
    adminUserApiRoutes.list,
    { params },
  );
  return data;
}

export async function getAdminUser(id: number): Promise<AdminUser> {
  const { data } = await api.get<AdminUser>(adminUserApiRoutes.detail(id));
  return data;
}

/** Makes the account's waiting signature the one printed documents stamp. */
export async function approveAdminUserSignature(
  id: number,
): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>(
    adminUserApiRoutes.approveSignature(id),
  );
  return data;
}

/** Drops the account's waiting signature; the reason is shown on its holder's profile. */
export async function rejectAdminUserSignature(
  id: number,
  reason: string,
): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>(
    adminUserApiRoutes.rejectSignature(id),
    { reason },
  );
  return data;
}

export async function getAssignableRoles(): Promise<AssignableRole[]> {
  const { data } = await api.get<AssignableRole[]>(adminUserApiRoutes.roles);
  return data;
}

export async function createAdminUser(
  payload: CreateAdminUserDto,
): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>(adminUserApiRoutes.list, payload);
  return data;
}

export async function updateAdminUser(
  id: number,
  payload: UpdateAdminUserDto,
): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(
    adminUserApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function setAdminUserActive(
  id: number,
  isActive: boolean,
): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(adminUserApiRoutes.active(id), {
    isActive,
  });
  return data;
}

/** Deactivates every ticked account; the outcome names the rows it could not touch. */
export async function bulkDeactivateAdminUsers(
  ids: number[],
): Promise<BulkDeleteResult> {
  const { data } = await api.post<BulkDeleteResult>(
    adminUserApiRoutes.bulkDeactivate,
    { ids },
  );
  return data;
}

/**
 * Soft-deletes an account: unlike deactivation it leaves the list for good and frees its
 * username and email.
 */
export async function deleteAdminUser(id: number): Promise<void> {
  await api.delete(adminUserApiRoutes.detail(id));
}

/** Deletes every ticked account; the outcome names the rows it could not touch. */
export async function bulkDeleteAdminUsers(
  ids: number[],
): Promise<BulkDeleteResult> {
  const { data } = await api.post<BulkDeleteResult>(
    adminUserApiRoutes.bulkDelete,
    { ids },
  );
  return data;
}

/** One request for the whole file: the backend creates every row or none. */
export async function importAdminUsers(
  documents: UserImportDocument[],
): Promise<UserImportResult> {
  const { data } = await api.post<UserImportResult>(adminUserApiRoutes.import, {
    documents,
  });
  return data;
}
