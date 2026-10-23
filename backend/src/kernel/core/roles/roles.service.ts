import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { filePermissions } from '@kernel/core/files/permissions/file.permissions';
import { UpdateRolePermissionsDto } from '@kernel/core/roles/dto/update-role-permissions.dto';
import { userPermissions } from '@kernel/core/users/constants/user-permission.constant';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import {
  ENABLED_PLUGINS,
  getAllPluginPermissions,
} from '@kernel/platform/plugins/enabled-plugins';

/** Full access is held by the director role alone and is not an assignable checkbox. */
const WILDCARD_PERMISSION = '*:*';

/**
 * Every permission a guard in this build reads: the plugins' own, plus the kernel scopes that
 * belong to no plugin. Leaving the kernel ones out would make saving a role that legitimately
 * holds `file:read` fail on a permission it already had.
 */
function knownPermissions(): string[] {
  return [
    ...new Set([
      ...getAllPluginPermissions(),
      ...filePermissions,
      ...userPermissions,
    ]),
  ];
}

/**
 * Scopes still declared but checked by no route, service or screen (audit 2026-10-19): the
 * retired single-step approvals, the legacy product write, the retired RFQ write, the
 * subcontract approval that has no flow, and the consumption report's write/delete that its
 * read-only screen never offers. Ticking one would change nothing, so the matrix leaves them
 * out; a role that still holds one keeps it on save.
 */
const RETIRED_PERMISSIONS = [
  'product:write',
  'rfq:write',
  'quotation:approve',
  'tooling_order:approve',
  'subcontract_order:approve',
  'consumption_report:write',
  'consumption_report:delete',
  // Function List 3.7 prints the RFQ, but no screen offers that printout yet; the scope is
  // seeded for its actors and offered once the button exists.
  'rfq:print',
];

/**
 * Scopes the catalog does not offer, though a role may still hold them.
 *
 * Attachment upload and download are plumbing every module borrows, not a function of the
 * Function List; listing them put a one-row "System" band under the eleven real modules,
 * which reads as a mistake. They stay valid on save, so a role seeded with them keeps them.
 *
 * The user import and export scopes are left out for the same reason the other way round: the
 * users screen is the administrator's alone (`*:*`), so ticking either for a role opens nothing.
 *
 * So are the receipt write-back scopes reserved for the QC system contract: no screen calls
 * their endpoints (the IQC and corrosion screens write through their own scopes), so a tick in
 * the matrix would change nothing.
 */
const SYSTEM_CONTRACT_PERMISSIONS = [
  'raw_material_receipt_ok:qc_result',
  'xlbm_receipt_ok:qc_result',
  'finished_product_receipt_ok:qc_result',
  'semi_finished_receipt_ok:qc_result',
  'finished_product_receipt_ok:corrosion_test',
] as const;

const UNLISTED_PERMISSIONS = new Set<string>([
  ...filePermissions,
  ...userPermissions,
  ...SYSTEM_CONTRACT_PERMISSIONS,
  ...RETIRED_PERMISSIONS,
]);

/** The module a permission belongs to, for a resource no plugin declares. */
const KERNEL_MODULE = 'kernel';

export interface PermissionGroup {
  /** Plugin the scope was declared by, so the screen can group what it lists. */
  module: string;
  resource: string;
  permissions: string[];
}

export interface RoleListItem {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: string[];
  /** How many accounts currently hold the role — the cost of changing it. */
  userCount: number;
}

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    private readonly principalCache: AuthPrincipalCache,
  ) {}

  /** Every role with the permissions it grants and its holder count (function list 1.10). */
  async findAll(): Promise<RoleListItem[]> {
    const roles = await this.roleRepo.find({
      where: { isDeleted: false },
      // By id, which is the order the seed writes the seventeen actors in — the same order
      // the Function List columns read, and one that does not move when a name is edited.
      order: { id: 'ASC' },
    });

    const assignments = await this.userRoleRepo.find({
      select: { roleId: true },
    });
    const counts = new Map<number, number>();
    for (const assignment of assignments) {
      counts.set(assignment.roleId, (counts.get(assignment.roleId) ?? 0) + 1);
    }

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description ?? null,
      isSystem: role.isSystem,
      permissions: role.permissions ?? [],
      userCount: counts.get(role.id) ?? 0,
    }));
  }

  /**
   * The permission catalog, grouped by the resource each one acts on, so the assignment screen
   * lists what the running build actually enforces rather than a hand-kept copy of it.
   */
  findPermissionCatalog(): PermissionGroup[] {
    // Which plugin declared a scope is the only honest grouping there is: a hand-kept map
    // would drift the moment a feature moves between modules.
    const moduleOf = new Map<string, string>();
    for (const plugin of ENABLED_PLUGINS) {
      for (const permission of plugin.permissions ?? []) {
        const resource = permission.split(':')[0];
        moduleOf.set(
          resource,
          plugin.permissionModules?.[resource] ?? plugin.name,
        );
      }
    }

    const byResource = new Map<string, Set<string>>();
    for (const permission of knownPermissions()) {
      if (UNLISTED_PERMISSIONS.has(permission)) continue;
      const resource = permission.split(':')[0];
      const bucket = byResource.get(resource) ?? new Set<string>();
      bucket.add(permission);
      byResource.set(resource, bucket);
    }

    return [...byResource.entries()]
      .map(([resource, permissions]) => ({
        module: moduleOf.get(resource) ?? KERNEL_MODULE,
        resource,
        permissions: [...permissions].sort(),
      }))
      .sort(
        (a, b) =>
          a.module.localeCompare(b.module) ||
          a.resource.localeCompare(b.resource),
      );
  }

  /**
   * Replaces a role's permission set (function list 1.11).
   *
   * A permission the build does not define is refused: it would sit in the row looking granted
   * while no guard ever reads it. The director role is left alone — its wildcard is what makes
   * this screen reachable in the first place.
   */
  async updatePermissions(
    id: number,
    dto: UpdateRolePermissionsDto,
    actorId: number,
  ): Promise<RoleListItem> {
    const role = await this.roleRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!role) throw new NotFoundException('Role not found');

    if (role.permissions?.includes(WILDCARD_PERMISSION)) {
      throw new BadRequestException(
        'The full-access role cannot have its permissions narrowed here',
      );
    }

    // A scope the role already held but the build no longer defines (a seeded row whose
    // feature was renamed or never shipped) comes back from the screen untouched; it is
    // dropped here rather than blocking every save of that role.
    const known = new Set(knownPermissions());
    const held = new Set(role.permissions ?? []);
    const unknown = dto.permissions.filter(
      (permission) => !known.has(permission) && !held.has(permission),
    );
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown permission(s): ${unknown.join(', ')}`,
      );
    }

    // A module wildcard the role still holds (`bom:*`) is not a matrix checkbox, so it would be
    // dropped by the filter below; it is saved as the concrete scopes it grants instead.
    const expanded = dto.permissions.flatMap((permission) =>
      held.has(permission) &&
      permission.endsWith(':*') &&
      permission !== WILDCARD_PERMISSION
        ? [...known].filter((scope) =>
            scope.startsWith(permission.slice(0, -1)),
          )
        : [permission],
    );
    role.permissions = [...new Set(expanded)]
      .filter((permission) => known.has(permission))
      .sort();
    role.updatedBy = actorId;
    await this.roleRepo.save(role);
    // Any number of accounts hold this role, so every cached principal may be stale.
    this.principalCache.clear();

    const roles = await this.findAll();
    const updated = roles.find((entry) => entry.id === id);
    if (!updated) throw new NotFoundException('Role not found');
    return updated;
  }
}
