import {
  Body,
  Controller,
  Get,
  HttpCode,
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

import {
  OpenOrderQueryDto,
  ProductionOrderFilterDto,
} from '@plugins/production/production-order/dto/production-order-filter.dto';
import {
  CreateProductionOrderDto,
  ProductionOrderReasonDto,
  UpdateProductionUnitDto,
} from '@plugins/production/production-order/dto/production-order.dto';
import {
  PRODUCTION_ORDER_CANCEL,
  PRODUCTION_ORDER_CREATE,
  PRODUCTION_ORDER_READ,
  PRODUCTION_ORDER_RELEASE,
  PRODUCTION_ORDER_UPDATE,
} from '@plugins/production/production-order/permissions/production-order.permissions';
import { ProductionOrderQueryService } from '@plugins/production/production-order/services/production-order-query.service';
import { ProductionOrderReleaseService } from '@plugins/production/production-order/services/production-order-release.service';
import { ProductionOrderUnitService } from '@plugins/production/production-order/services/production-order-unit.service';
import { ProductionOrderService } from '@plugins/production/production-order/services/production-order.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('production/orders')
@ApiBearerAuth()
@Controller('production')
export class ProductionOrderController {
  constructor(
    private readonly service: ProductionOrderService,
    private readonly queries: ProductionOrderQueryService,
    private readonly release: ProductionOrderReleaseService,
    private readonly units: ProductionOrderUnitService,
  ) {}

  @Get('orders')
  @RequirePermission(PRODUCTION_ORDER_READ)
  @ApiOperation({
    summary: 'List production orders',
    description:
      'Filter by status or sales order. A sales actor sees the production orders of the orders they own; a technician only those with a cabinet assigned to them.',
  })
  @ApiResponse({ status: 200, description: 'Paginated production orders' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_order:read',
  })
  findAll(
    @Query() query: ProductionOrderFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.findAll(query, user);
  }

  @Get('open-orders')
  @RequirePermission(PRODUCTION_ORDER_CREATE)
  @ApiOperation({
    summary: 'List the open orders a production order can still be made for',
    description: 'Code, customer name and delivery date only.',
  })
  @ApiResponse({ status: 200, description: 'Open orders without production' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_order:create',
  })
  findOpenOrders(
    @Query() query: OpenOrderQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.findOpenOrders(query, user);
  }

  @Get('technician-options')
  @RequirePermission(PRODUCTION_ORDER_UPDATE)
  @ApiOperation({
    summary: 'List the accounts a cabinet may be assigned to',
    description: 'Active accounts holding the technician role.',
  })
  @ApiResponse({ status: 200, description: 'Technician options' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_order:update',
  })
  listTechnicianOptions() {
    return this.service.listTechnicianOptions();
  }

  @Get('orders/:id')
  @RequirePermission(PRODUCTION_ORDER_READ)
  @ApiOperation({
    summary: 'Get a production order with its cabinets and history',
    description: 'A technician sees only the cabinets assigned to them.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Production order' })
  @ApiResponse({
    status: 404,
    description: 'Not found, or outside the caller’s data scope',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.findOne(id, user);
  }

  @Get('orders/:id/shortage')
  @RequirePermission(PRODUCTION_ORDER_READ)
  @ApiOperation({
    summary: 'List the items the order is still short of',
    description:
      'Quantities only, as the material view computes them. Nothing here blocks a stage.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Short items, possibly none' })
  @ApiResponse({
    status: 404,
    description: 'Not found, or outside the caller’s data scope',
  })
  findShortage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.findShortage(id, user);
  }

  @Post('orders')
  @RequirePermission(PRODUCTION_ORDER_CREATE)
  @ApiOperation({
    summary: 'Create a draft production order for an open order',
    description:
      'One cabinet per panel ordered, coded <tag>-<n>, each with its six stages pending.',
  })
  @ApiBody({ type: CreateProductionOrderDto })
  @ApiResponse({ status: 201, description: 'Draft created' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 409,
    description: 'The order is not open or already has a production order',
  })
  create(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Patch('orders/:id/units/:unitId')
  @RequirePermission(PRODUCTION_ORDER_UPDATE)
  @ApiOperation({
    summary: 'Assign a technician and a planned end date to a cabinet',
    description:
      'The assignee must hold the technician role. Refused once the order is completed or cancelled, or the cabinet is finished.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiBody({ type: UpdateProductionUnitDto })
  @ApiResponse({ status: 200, description: 'Cabinet updated' })
  @ApiResponse({ status: 400, description: 'Assignee is not a technician' })
  @ApiResponse({
    status: 404,
    description: 'Production order or cabinet not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Order completed or cancelled, or cabinet finished',
  })
  updateUnit(
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: UpdateProductionUnitDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.units.update(id, unitId, dto, user);
  }

  @Post('orders/:id/release')
  @HttpCode(200)
  @RequirePermission(PRODUCTION_ORDER_RELEASE)
  @ApiOperation({
    summary: 'Release a draft to the workshop',
    description:
      'Every cabinet needs a technician and a planned end date. The sales order becomes in_production and keeps its materials.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Released' })
  @ApiResponse({
    status: 400,
    description: 'Cabinets without a technician or a planned end date',
  })
  @ApiResponse({
    status: 409,
    description: 'Not a draft, or the sales order is no longer open',
  })
  releaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.release.release(id, user);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @RequirePermission(PRODUCTION_ORDER_CANCEL)
  @ApiOperation({
    summary: 'Cancel a draft or released production order',
    description:
      'A released order gives the sales order back: it becomes open again. Stage history stays.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: ProductionOrderReasonDto })
  @ApiResponse({ status: 200, description: 'Cancelled' })
  @ApiResponse({ status: 409, description: 'Already completed or cancelled' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProductionOrderReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.release.cancel(id, dto, user);
  }
}
