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

import { StockReceiptFilterDto } from '@plugins/inventory/receipt/dto/stock-receipt-filter.dto';
import { CreateStockReceiptDto } from '@plugins/inventory/receipt/dto/stock-receipt.dto';
import {
  STOCK_RECEIPT_CREATE,
  STOCK_RECEIPT_READ,
} from '@plugins/inventory/receipt/permissions/receipt.permissions';
import { StockReceiptService } from '@plugins/inventory/receipt/services/receipt.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Response } from 'express';

@ApiTags('inventory/receipts')
@ApiBearerAuth()
@Controller('inventory/receipts')
export class StockReceiptController {
  constructor(private readonly service: StockReceiptService) {}

  @Get()
  @RequirePermission(STOCK_RECEIPT_READ)
  @ApiOperation({ summary: 'List stock receipts' })
  @ApiResponse({ status: 200, description: 'Paginated stock receipts' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires stock_receipt:read',
  })
  findAll(@Query() query: StockReceiptFilterDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission(STOCK_RECEIPT_READ)
  @ApiOperation({
    summary: 'Get a stock receipt with its lines',
    description: 'Unit costs only with purchase_price:read.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Stock receipt' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(STOCK_RECEIPT_CREATE)
  @ApiOperation({
    summary: 'Receive goods of an approved purchase order into stock',
    description:
      'Posts at the order line prices and allocates the stock to short orders, the order’s source orders first. A request key already used answers the first receipt with 200 and posts nothing.',
  })
  @ApiBody({ type: CreateStockReceiptDto })
  @ApiResponse({ status: 201, description: 'Receipt posted' })
  @ApiResponse({
    status: 200,
    description: 'The request key was posted before: the first receipt',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error, or a line not on the order',
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  @ApiResponse({
    status: 409,
    description:
      'Order not approved or partly received, more than remains, or item deleted',
  })
  async create(
    @Body() dto: CreateStockReceiptDto,
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.create(dto, user);
    if (!result.created) res.status(200);
    return result.receipt;
  }
}
