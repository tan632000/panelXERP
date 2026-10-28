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

import { PurchaseOrderFilterDto } from '@plugins/inventory/purchase-order/dto/purchase-order-filter.dto';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderReasonDto,
  UpdatePurchaseOrderDto,
} from '@plugins/inventory/purchase-order/dto/purchase-order.dto';
import {
  PURCHASE_ORDER_APPROVE,
  PURCHASE_ORDER_CANCEL,
  PURCHASE_ORDER_CLOSE,
  PURCHASE_ORDER_CREATE,
  PURCHASE_ORDER_READ,
  PURCHASE_ORDER_SUBMIT,
  PURCHASE_ORDER_UPDATE,
} from '@plugins/inventory/purchase-order/permissions/purchase-order.permissions';
import { PurchaseOrderApprovalService } from '@plugins/inventory/purchase-order/services/purchase-order-approval.service';
import { PurchaseOrderService } from '@plugins/inventory/purchase-order/services/purchase-order.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const MONEY_NOTE =
  'VAT rate, unit prices, amounts and totals only with purchase_price:read.';

@ApiTags('inventory/purchase-orders')
@ApiBearerAuth()
@Controller('inventory/purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly service: PurchaseOrderService,
    private readonly approval: PurchaseOrderApprovalService,
  ) {}

  @Get()
  @RequirePermission(PURCHASE_ORDER_READ)
  @ApiOperation({ summary: 'List purchase orders', description: MONEY_NOTE })
  @ApiResponse({ status: 200, description: 'Paginated purchase orders' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires purchase_order:read',
  })
  findAll(
    @Query() query: PurchaseOrderFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(PURCHASE_ORDER_READ)
  @ApiOperation({
    summary: 'Get a purchase order with its lines and history',
    description: MONEY_NOTE,
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Purchase order' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(PURCHASE_ORDER_CREATE)
  @ApiOperation({ summary: 'Create a draft purchase order' })
  @ApiBody({ type: CreatePurchaseOrderDto })
  @ApiResponse({ status: 201, description: 'Draft created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Supplier or item not found' })
  @ApiResponse({
    status: 409,
    description: 'Supplier inactive or item deleted',
  })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(PURCHASE_ORDER_UPDATE)
  @ApiOperation({
    summary: 'Edit a draft',
    description:
      'Lines, when given, replace every line. The editor can no longer approve the order.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdatePurchaseOrderDto })
  @ApiResponse({ status: 200, description: 'Draft updated' })
  @ApiResponse({
    status: 409,
    description: 'Not a draft, or supplier/item unusable',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission(PURCHASE_ORDER_SUBMIT)
  @ApiOperation({ summary: 'Submit a draft for approval' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Pending approval' })
  @ApiResponse({ status: 409, description: 'Not a draft, or no lines' })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.submit(id, user);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission(PURCHASE_ORDER_APPROVE)
  @ApiOperation({
    summary: 'Approve a submitted order',
    description:
      'Refused to its creator, its submitter and anyone who edited it.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Approved' })
  @ApiResponse({ status: 403, description: 'The actor took part in the order' })
  @ApiResponse({ status: 409, description: 'Not pending approval' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission(PURCHASE_ORDER_APPROVE)
  @ApiOperation({
    summary: 'Reject a submitted order back to draft',
    description: 'The reason is kept in the order history.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: PurchaseOrderReasonDto })
  @ApiResponse({ status: 200, description: 'Back to draft' })
  @ApiResponse({ status: 403, description: 'The actor took part in the order' })
  @ApiResponse({ status: 409, description: 'Not pending approval' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PurchaseOrderReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.reject(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(PURCHASE_ORDER_CANCEL)
  @ApiOperation({ summary: 'Cancel an order nothing was received on' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: PurchaseOrderReasonDto })
  @ApiResponse({ status: 200, description: 'Cancelled' })
  @ApiResponse({ status: 409, description: 'Wrong status or goods received' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PurchaseOrderReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.cancel(id, dto, user);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission(PURCHASE_ORDER_CLOSE)
  @ApiOperation({ summary: 'Short-close an approved or partly received order' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: PurchaseOrderReasonDto })
  @ApiResponse({ status: 200, description: 'Closed' })
  @ApiResponse({ status: 409, description: 'Wrong status' })
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PurchaseOrderReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.close(id, dto, user);
  }
}
