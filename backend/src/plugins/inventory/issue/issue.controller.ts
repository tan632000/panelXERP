import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
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

import { OrderStockDocumentFilterDto } from '@plugins/inventory/issue/dto/stock-issue-filter.dto';
import { CreateStockIssueDto } from '@plugins/inventory/issue/dto/stock-issue.dto';
import {
  STOCK_ISSUE_CREATE,
  STOCK_ISSUE_READ,
} from '@plugins/inventory/issue/permissions/issue.permissions';
import { StockIssueService } from '@plugins/inventory/issue/services/issue.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Response } from 'express';

const COST_NOTE = 'Line unit costs and values only with purchase_price:read.';

@ApiTags('inventory/issues')
@ApiBearerAuth()
@Controller('inventory/issues')
export class StockIssueController {
  constructor(private readonly service: StockIssueService) {}

  @Get()
  @RequirePermission(STOCK_ISSUE_READ)
  @ApiOperation({ summary: 'List stock issues' })
  @ApiResponse({ status: 200, description: 'Paginated stock issues' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires stock_issue:read',
  })
  findAll(
    @Query() query: OrderStockDocumentFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(STOCK_ISSUE_READ)
  @ApiOperation({
    summary: 'Get a stock issue with its lines',
    description: COST_NOTE,
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Stock issue' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(STOCK_ISSUE_CREATE)
  @ApiOperation({
    summary: 'Issue materials to an open order',
    description:
      'Uses the order’s reservation first, then free stock, never another order’s reservation. Beyond the BOM every line of the item needs a reason. A request key already used answers the first issue with 200 and posts nothing.',
  })
  @ApiBody({ type: CreateStockIssueDto })
  @ApiResponse({ status: 201, description: 'Issue posted' })
  @ApiResponse({
    status: 200,
    description: 'The request key was posted before: the first issue',
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, a panel of another order, or a reason missing beyond the BOM',
  })
  @ApiResponse({ status: 404, description: 'Order or item not found' })
  @ApiResponse({
    status: 409,
    description:
      'Order not open, not enough stock outside other orders’ reservations, or item deleted',
  })
  async create(
    @Body() dto: CreateStockIssueDto,
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.create(dto, user);
    if (!result.created) res.status(200);
    return result.issue;
  }
}
