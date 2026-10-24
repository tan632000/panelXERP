import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermission,
} from '@kernel/core/auth/decorators/auth.decorators';

import { BulkDeleteEndpoint } from '@shared/decorators/bulk-delete-endpoint.decorator';
import { ColumnValuesEndpoint } from '@shared/decorators/column-values-endpoint.decorator';
import { BulkDeleteDto } from '@shared/dto/bulk-delete.dto';
import { columnFilterKeys } from '@shared/utils/column-filter.util';

import { CreateProjectDto } from '@plugins/crm/project/dto/create-project.dto';
import {
  ProjectColumnValuesQueryDto,
  ProjectFilterDto,
} from '@plugins/crm/project/dto/project-filter.dto';
import { UpdateProjectDto } from '@plugins/crm/project/dto/update-project.dto';
import {
  PROJECT_CREATE,
  PROJECT_DELETE,
  PROJECT_READ,
  PROJECT_UPDATE,
} from '@plugins/crm/project/permissions/project.permissions';
import {
  PROJECT_COLUMN_FILTERS,
  ProjectService,
} from '@plugins/crm/project/services/project.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('crm/projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  @Get()
  @RequirePermission(PROJECT_READ)
  @ApiOperation({
    summary: 'List projects',
    description:
      'Paginated project list with search and column filters. Projects follow their customer: a Sales actor sees only the projects of customers they own.',
  })
  @ApiResponse({ status: 200, description: 'Paginated project list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires project:read',
  })
  findAll(
    @Query() query: ProjectFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @ColumnValuesEndpoint({
    permission: PROJECT_READ,
    columns: columnFilterKeys(PROJECT_COLUMN_FILTERS),
    subject: 'project',
  })
  findColumnValues(
    @Query() query: ProjectColumnValuesQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findColumnValues(query, user);
  }

  @Get('next-code')
  @RequirePermission(PROJECT_CREATE)
  @ApiOperation({
    summary: 'Preview next project code',
    description:
      'Returns the next suggested DA_xxxx code without reserving it. The code stays editable on create.',
  })
  @ApiResponse({ status: 200, description: 'Next suggested code' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires project:create',
  })
  getNextCode() {
    return this.service.getNextCode();
  }

  @Get(':id')
  @RequirePermission(PROJECT_READ)
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Project found' })
  @ApiResponse({
    status: 404,
    description:
      'Not found, soft-deleted, or its customer is owned by another sales account',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(PROJECT_CREATE)
  @ApiOperation({
    summary: 'Create project',
    description:
      'Code must be unique among active projects. The customer is fixed at creation.',
  })
  @ApiBody({ type: CreateProjectDto })
  @ApiResponse({ status: 201, description: 'Project created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires project:create',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found or owned by another sales account',
  })
  @ApiResponse({ status: 409, description: 'Duplicate project code' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(PROJECT_UPDATE)
  @ApiOperation({
    summary: 'Update project',
    description: 'Code and customer are immutable.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateProjectDto })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires project:update',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission(PROJECT_DELETE)
  @ApiOperation({
    summary: 'Soft-delete project',
    description:
      'Refused with 409 while any sales document references the project.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Project soft-deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires project:delete',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({
    status: 409,
    description: 'Project is referenced by a document',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, user);
  }

  @BulkDeleteEndpoint({ permission: PROJECT_DELETE, subject: 'projects' })
  bulkRemove(@Body() dto: BulkDeleteDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.removeMany(dto.ids, user);
  }
}
