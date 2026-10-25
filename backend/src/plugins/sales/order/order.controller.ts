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

import { CreateOrderDto } from '@plugins/sales/order/dto/create-order.dto';
import { OrderFilterDto } from '@plugins/sales/order/dto/order-filter.dto';
import { UpdateOrderDto } from '@plugins/sales/order/dto/update-order.dto';
import {
  ORDER_CANCEL,
  ORDER_CREATE,
  ORDER_READ,
  ORDER_UPDATE,
} from '@plugins/sales/order/permissions/order.permissions';
import { OrderConvertService } from '@plugins/sales/order/services/order-convert.service';
import { OrderEditService } from '@plugins/sales/order/services/order-edit.service';
import { OrderService } from '@plugins/sales/order/services/order.service';
import { RequestReasonDto } from '@plugins/sales/request/dto/request-reason.dto';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const NOT_FOUND =
  'Not found, or outside the caller’s data scope (a Sales actor reads the orders of requests they own)';

@ApiTags('sales/orders')
@ApiBearerAuth()
@Controller('sales/orders')
export class OrderController {
  constructor(
    private readonly service: OrderService,
    private readonly converter: OrderConvertService,
    private readonly editor: OrderEditService,
  ) {}

  @Get()
  @RequirePermission(ORDER_READ)
  @ApiOperation({
    summary: 'List orders',
    description:
      'Paginated list; filter by status, code or customer. The keyword matches the order code, the customer name, the contract number or the request code. A Sales actor sees the orders of the requests they own.',
  })
  @ApiResponse({ status: 200, description: 'Paginated order list' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires order:read' })
  findAll(
    @Query() query: OrderFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(ORDER_READ)
  @ApiOperation({
    summary: 'Get an order',
    description:
      'The order with its snapshots, lines (and their BOM) and the chain links to its request, estimate revision and quotation version.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(ORDER_CREATE)
  @ApiOperation({
    summary: 'Convert a confirmed quotation into an order',
    description:
      'Snapshots the customer-confirmed version (customer, project, terms, lines, totals) into one order DH_YYYY_NNNN and moves the request to won in the same transaction. Contract number, contract date and delivery date are optional. A quotation whose latest version is not customer_confirmed, or that already has an order (cancelled ones included), answers 409.',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires order:create',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description:
      'Not customer-confirmed, or the quotation already has an order',
  })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUserPayload) {
    return this.converter.convert(dto, user);
  }

  @Patch(':id')
  @RequirePermission(ORDER_UPDATE)
  @ApiOperation({
    summary: 'Edit the contract number, contract date and delivery date',
    description:
      'Only while the order is open; lines, prices, totals and snapshots are never editable.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateOrderDto })
  @ApiResponse({ status: 200, description: 'Order updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires order:update',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'The order is not open' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.update(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(ORDER_CANCEL)
  @ApiOperation({
    summary: 'Cancel the order',
    description:
      'An open order becomes cancelled and its request lost, with the reason, in one transaction. The quotation stays confirmed and is not converted again. Any other status answers 409.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RequestReasonDto })
  @ApiResponse({ status: 200, description: 'Cancelled; the request is lost' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires order:cancel',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'The order is not open' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.cancel(id, dto, user);
  }
}
