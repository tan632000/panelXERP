import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
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
  StockAvailabilityQueryDto,
  StockFilterDto,
  StockMovementFilterDto,
} from '@plugins/inventory/stock/dto/stock-filter.dto';
import {
  STOCK_AVAILABILITY,
  STOCK_LEDGER,
  STOCK_READ,
} from '@plugins/inventory/stock/permissions/stock.permissions';
import { StockAvailabilityService } from '@plugins/inventory/stock/services/stock-availability.service';
import { StockQueryService } from '@plugins/inventory/stock/services/stock-query.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('inventory/stock')
@ApiBearerAuth()
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly service: StockQueryService,
    private readonly availability: StockAvailabilityService,
  ) {}

  @Get()
  @RequirePermission(STOCK_READ)
  @ApiOperation({
    summary: 'List stock',
    description:
      'Every active item with on hand, reserved, available and minimum stock. Average cost and value only with purchase_price:read.',
  })
  @ApiResponse({ status: 200, description: 'Paginated stock list' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires stock:read' })
  findAll(
    @Query() query: StockFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get('availability')
  @RequirePermission(STOCK_AVAILABILITY)
  @ApiOperation({
    summary: 'Stock availability of items',
    description:
      'On hand, reserved and available per item, never any cost. Items without stock answer zeros; deleted or unknown ids are left out.',
  })
  @ApiResponse({ status: 200, description: 'One row per active item' })
  @ApiResponse({ status: 400, description: 'itemIds missing or over 500' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires stock:availability',
  })
  findAvailability(@Query() query: StockAvailabilityQueryDto) {
    return this.availability.findByItems(query.itemIds);
  }

  @Get(':itemId/movements')
  @RequirePermission(STOCK_LEDGER)
  @ApiOperation({
    summary: 'List the stock movements of an item',
    description:
      'Newest first. Unit cost, value, reference value and average cost only with purchase_price:read.',
  })
  @ApiParam({ name: 'itemId', type: Number })
  @ApiResponse({ status: 200, description: 'Paginated movements' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires stock:ledger',
  })
  @ApiResponse({ status: 404, description: 'Item not found or deleted' })
  findMovements(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query() query: StockMovementFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findMovements(itemId, query, user);
  }
}
