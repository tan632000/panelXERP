import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
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
  CreateQcChecklistItemDto,
  QcChecklistFilterDto,
  ReorderQcChecklistDto,
  UpdateQcChecklistItemDto,
} from '@plugins/delivery/qc-checklist/dto/qc-checklist.dto';
import {
  QC_CHECKLIST_MANAGE,
  QC_CHECKLIST_READ,
} from '@plugins/delivery/qc-checklist/permissions/qc-checklist.permissions';
import { QcChecklistService } from '@plugins/delivery/qc-checklist/services/qc-checklist.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('delivery/qc-checklist')
@ApiBearerAuth()
@Controller('delivery/qc/checklist-items')
export class QcChecklistController {
  constructor(private readonly service: QcChecklistService) {}

  @Get()
  @RequirePermission(QC_CHECKLIST_READ)
  @ApiOperation({
    summary: 'List the QC checklist template',
    description:
      'Ordered by position. Hidden items are returned only with includeHidden=true.',
  })
  @ApiResponse({ status: 200, description: 'Checklist items in order' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_checklist:read',
  })
  list(@Query() query: QcChecklistFilterDto) {
    return this.service.list(query.includeHidden === 'true');
  }

  @Post()
  @RequirePermission(QC_CHECKLIST_MANAGE)
  @ApiOperation({ summary: 'Add an item at the end of the template' })
  @ApiBody({ type: CreateQcChecklistItemDto })
  @ApiResponse({ status: 201, description: 'Item added' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_checklist:manage',
  })
  @ApiResponse({ status: 409, description: 'An item with this name exists' })
  add(
    @Body() dto: CreateQcChecklistItemDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.add(dto, user);
  }

  @Put('order')
  @RequirePermission(QC_CHECKLIST_MANAGE)
  @ApiOperation({
    summary: 'Reorder the template',
    description:
      'ids must be exactly the set of all item ids, hidden ones included.',
  })
  @ApiBody({ type: ReorderQcChecklistDto })
  @ApiResponse({ status: 200, description: 'Items in the new order' })
  @ApiResponse({ status: 400, description: 'ids is not the full set' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_checklist:manage',
  })
  reorder(
    @Body() dto: ReorderQcChecklistDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.reorder(dto.ids, user);
  }

  @Patch(':id')
  @RequirePermission(QC_CHECKLIST_MANAGE)
  @ApiOperation({ summary: 'Rename an item, or hide or show it' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateQcChecklistItemDto })
  @ApiResponse({ status: 200, description: 'Item updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_checklist:manage',
  })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 409, description: 'An item with this name exists' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQcChecklistItemDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }
}
