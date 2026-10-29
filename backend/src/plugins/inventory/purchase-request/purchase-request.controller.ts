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
  CreatePurchaseRequestDto,
  PurchaseRequestFilterDto,
  PurchaseRequestReasonDto,
  UpdatePurchaseRequestDto,
} from '@plugins/inventory/purchase-request/dto/purchase-request.dto';
import {
  PURCHASE_REQUEST_CANCEL,
  PURCHASE_REQUEST_CREATE,
  PURCHASE_REQUEST_READ,
  PURCHASE_REQUEST_UPDATE,
} from '@plugins/inventory/purchase-request/permissions/purchase-request.permissions';
import { PurchaseRequestService } from '@plugins/inventory/purchase-request/services/purchase-request.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('inventory/purchase-requests')
@ApiBearerAuth()
@Controller('inventory/purchase-requests')
export class PurchaseRequestController {
  constructor(private readonly service: PurchaseRequestService) {}

  @Get()
  @RequirePermission(PURCHASE_REQUEST_READ)
  @ApiOperation({
    summary: 'List purchase requests with what each line has been ordered',
  })
  @ApiResponse({ status: 200, description: 'Paginated purchase requests' })
  findAll(
    @Query() query: PurchaseRequestFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(PURCHASE_REQUEST_READ)
  @ApiOperation({ summary: 'Get a purchase request' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Purchase request' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(PURCHASE_REQUEST_CREATE)
  @ApiOperation({ summary: 'Raise a purchase request by hand' })
  @ApiBody({ type: CreatePurchaseRequestDto })
  @ApiResponse({ status: 201, description: 'Request raised' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 409, description: 'Item deleted' })
  create(
    @Body() dto: CreatePurchaseRequestDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Post('from-order/:orderId')
  @RequirePermission(PURCHASE_REQUEST_CREATE)
  @ApiOperation({
    summary: 'Request what an order is still short of',
    description:
      'One line per item: the shortage less what open requests for the order still ask and what purchase orders bought for it still bring.',
  })
  @ApiParam({ name: 'orderId', type: Number })
  @ApiResponse({ status: 201, description: 'Request raised' })
  @ApiResponse({
    status: 404,
    description: 'Order not found or outside the reader’s scope',
  })
  @ApiResponse({ status: 409, description: 'Nothing left to request' })
  createFromOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.createFromOrder(orderId, user);
  }

  @Patch(':id')
  @RequirePermission(PURCHASE_REQUEST_UPDATE)
  @ApiOperation({
    summary: 'Edit a request nothing has been ordered on',
    description: 'Lines, when given, replace every line.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdatePurchaseRequestDto })
  @ApiResponse({ status: 200, description: 'Request updated' })
  @ApiResponse({ status: 409, description: 'Cancelled or already ordered' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseRequestDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(PURCHASE_REQUEST_CANCEL)
  @ApiOperation({ summary: 'Cancel a request nothing has been ordered on' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: PurchaseRequestReasonDto })
  @ApiResponse({ status: 200, description: 'Cancelled' })
  @ApiResponse({ status: 409, description: 'Already cancelled or ordered' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PurchaseRequestReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.cancel(id, dto, user);
  }
}
