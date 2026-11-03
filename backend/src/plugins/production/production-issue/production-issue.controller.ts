import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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

import {
  CreateProductionIssueDto,
  ProductionIssueFilterDto,
  ResolveProductionIssueDto,
} from '@plugins/production/production-issue/dto/production-issue.dto';
import {
  PRODUCTION_ISSUE_CREATE,
  PRODUCTION_ISSUE_READ,
  PRODUCTION_ISSUE_RESOLVE,
} from '@plugins/production/production-issue/permissions/production-issue.permissions';
import { ProductionIssueService } from '@plugins/production/production-issue/services/production-issue.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('production/issues')
@ApiBearerAuth()
@Controller('production')
export class ProductionIssueController {
  constructor(private readonly service: ProductionIssueService) {}

  @Get('issues')
  @RequirePermission(PRODUCTION_ISSUE_READ)
  @ApiOperation({
    summary: 'List production issues',
    description:
      'Filter by status, production order or cabinet. A technician sees only the issues of their own cabinets; a sales actor those of the orders they own.',
  })
  @ApiResponse({ status: 200, description: 'Paginated issues, newest first' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_issue:read',
  })
  findAll(
    @Query() query: ProductionIssueFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Post('units/:id/issues')
  @RequirePermission(PRODUCTION_ISSUE_CREATE)
  @ApiOperation({
    summary: 'Report an issue on a stage of a cabinet',
    description:
      'Only the assigned technician or a production manager, while the production order is released. An open issue never blocks a stage; the production managers are told.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreateProductionIssueDto })
  @ApiResponse({ status: 201, description: 'Issue opened' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_issue:create',
  })
  @ApiResponse({ status: 404, description: 'Cabinet not found or not yours' })
  @ApiResponse({ status: 409, description: 'Order not released' })
  open(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductionIssueDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.open(id, dto, user);
  }

  @Post('issues/:id/resolve')
  @HttpCode(200)
  @RequirePermission(PRODUCTION_ISSUE_RESOLVE)
  @ApiOperation({
    summary: 'Resolve an issue',
    description:
      'Production manager only, with a resolution. The technician who reported it is told.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: ResolveProductionIssueDto })
  @ApiResponse({ status: 200, description: 'Issue resolved' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_issue:resolve',
  })
  @ApiResponse({ status: 404, description: 'Issue not found' })
  @ApiResponse({ status: 409, description: 'Issue already resolved' })
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveProductionIssueDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.resolve(id, dto.resolution, user);
  }
}
