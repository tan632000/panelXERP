import api from "@/kernel/core/api/api";

import { systemRoleApiRoutes } from "@plugins/system/roles/constants";

import type { PermissionGroup, SystemRole } from "@plugins/system/roles/types";

export async function getSystemRoles(): Promise<SystemRole[]> {
  const { data } = await api.get<SystemRole[]>(systemRoleApiRoutes.list);
  return data;
}

export async function getPermissionCatalog(): Promise<PermissionGroup[]> {
  const { data } = await api.get<PermissionGroup[]>(
    systemRoleApiRoutes.permissionCatalog,
  );
  return data;
}

export async function updateRolePermissions(
  id: number,
  permissions: string[],
): Promise<SystemRole> {
  const { data } = await api.patch<SystemRole>(
    systemRoleApiRoutes.permissions(id),
    { permissions },
  );
  return data;
}
