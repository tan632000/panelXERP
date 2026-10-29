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

import { MaterialOrderFilterDto } from '@plugins/inventory/material/dto/material-filter.dto';
import { MATERIAL_READ } from '@plugins/inventory/material/permissions/material.permissions';
import { EstimateVsActualService } from '@plugins/inventory/material/services/estimate-vs-actual.service';
import { MaterialService } from '@plugins/inventory/material/services/material.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('inventory/materials')
@ApiBearerAuth()
@Controller('inventory/materials')
export class MaterialController {
  constructor(
    private readonly service: MaterialService,
    private readonly estimateVsActual: EstimateVsActualService,
  ) {}

  @Get('orders')
  @RequirePermission(MATERIAL_READ)
  @ApiOperation({
    summary: 'List orders with their material shortage',
    description:
      'Every order the actor may see (a sales account only its own), with the count of items still short. No sales money.',
  })
  @ApiResponse({ status: 200, description: 'Paginated orders' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires material:read',
  })
  findOrders(
    @Query() query: MaterialOrderFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOrders(query, user);
  }

  @Get('orders/:orderId/estimate-vs-actual')
  @RequirePermission(MATERIAL_READ)
  @ApiOperation({
    summary: 'Estimate against actual material of one order',
    description:
      'Per item: estimated (BOM) and actual (issued net of workshop returns) quantity; costs only with purchase_price:read. Every over-BOM issue with its reason. No sales money.',
  })
  @ApiParam({ name: 'orderId', type: Number })
  @ApiResponse({ status: 200, description: 'Estimate against actual' })
  @ApiResponse({
    status: 404,
    description: 'Not found or outside the actor’s scope',
  })
  findEstimateVsActual(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.estimateVsActual.report(orderId, user);
  }

  @Get('orders/:orderId')
  @RequirePermission(MATERIAL_READ)
  @ApiOperation({
    summary: 'Material view of one order',
    description:
      'Per item: demand, reserved, issued, returned and short; per panel its BOM; unlinked BOM lines listed apart. No sales money.',
  })
  @ApiParam({ name: 'orderId', type: Number })
  @ApiResponse({ status: 200, description: 'Order material view' })
  @ApiResponse({
    status: 404,
    description: 'Not found or outside the actor’s scope',
  })
  findOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOrder(orderId, user);
  }
}
