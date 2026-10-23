import { systemRolesFeature } from "@plugins/system/roles/roles.feature";
import { systemUsersFeature } from "@plugins/system/users/users.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/**
 * System feature catalog — function list 1.5–1.11.
 *
 * These two screens are reached from the account menu rather than the sidebar: administration
 * is not a module of the Function List. The entries stay here so the routes keep their feature
 * key, which is what the feature toggle and the route guard read.
 */
export const SYSTEM_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  systemUsersFeature,
  systemRolesFeature,
];
