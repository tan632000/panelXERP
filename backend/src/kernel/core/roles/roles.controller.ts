import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermission,
} from '@kernel/core/auth/decorators/auth.decorators';
import { UpdateRolePermissionsDto } from '@kernel/core/roles/dto/update-role-permissions.dto';
import { RolesService } from '@kernel/core/roles/roles.service';

import { ActivityLogService } from '@shared/activities/activity-log.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @ApiOperation({ summary: 'List roles with the permissions they grant' })
  @Get()
  @RequirePermission('*:*')
  findAll() {
    return this.rolesService.findAll();
  }

  @ApiOperation({
    summary: 'List every permission the build defines, grouped by resource',
  })
  @Get('permissions')
  @RequirePermission('*:*')
  findPermissionCatalog() {
    return this.rolesService.findPermissionCatalog();
  }

  @ApiOperation({ summary: "Replace a role's permission set" })
  @Patch(':id/permissions')
  @RequirePermission('*:*')
  async updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const role = await this.rolesService.updatePermissions(
      id,
      dto,
      actor.userId,
    );

    this.activityLog.track({
      module: 'roles',
      action: 'update',
      userId: actor.userId,
      username: actor.username,
      targetType: 'role',
      targetId: id,
      message: `Administrator changed the permissions of role ${role.code}`,
    });

    return role;
  }
}
