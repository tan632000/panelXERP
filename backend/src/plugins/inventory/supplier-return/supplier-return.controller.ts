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

import {
  STOCK_RETURN_CREATE,
  STOCK_RETURN_READ,
} from '@plugins/inventory/issue/permissions/issue.permissions';
import {
  CreateSupplierReturnDto,
  SupplierReturnFilterDto,
} from '@plugins/inventory/supplier-return/dto/supplier-return.dto';
import { SupplierReturnService } from '@plugins/inventory/supplier-return/services/supplier-return.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Response } from 'express';

@ApiTags('inventory/supplier-returns')
@ApiBearerAuth()
@Controller('inventory/supplier-returns')
export class SupplierReturnController {
  constructor(private readonly service: SupplierReturnService) {}

  @Get()
  @RequirePermission(STOCK_RETURN_READ)
  @ApiOperation({ summary: 'List supplier returns' })
  @ApiResponse({ status: 200, description: 'Paginated supplier returns' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires stock_return:read',
  })
  findAll(@Query() query: SupplierReturnFilterDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission(STOCK_RETURN_READ)
  @ApiOperation({
    summary: 'Get a supplier return with its lines',
    description:
      'Unit costs, values and reference values only with purchase_price:read.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Supplier return' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(STOCK_RETURN_CREATE)
  @ApiOperation({
    summary: 'Return received goods to the supplier',
    description:
      'At most what the purchase order line has received; leaves at the order price and shrinks reservations the stock no longer covers. A request key already used answers the first return with 200.',
  })
  @ApiBody({ type: CreateSupplierReturnDto })
  @ApiResponse({ status: 201, description: 'Return posted' })
  @ApiResponse({
    status: 200,
    description: 'The request key was posted before: the first return',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error, no reason, or a line not on the order',
  })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  @ApiResponse({
    status: 409,
    description:
      'Nothing received on the order, more than received or on hand, or item deleted',
  })
  async create(
    @Body() dto: CreateSupplierReturnDto,
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.create(dto, user);
    if (!result.created) res.status(200);
    return result.supplierReturn;
  }
}
