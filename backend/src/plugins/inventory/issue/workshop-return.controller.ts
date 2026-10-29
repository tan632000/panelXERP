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
import { CreateWorkshopReturnDto } from '@plugins/inventory/issue/dto/stock-issue.dto';
import {
  STOCK_RETURN_CREATE,
  STOCK_RETURN_READ,
} from '@plugins/inventory/issue/permissions/issue.permissions';
import { WorkshopReturnService } from '@plugins/inventory/issue/services/workshop-return.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { Response } from 'express';

@ApiTags('inventory/workshop-returns')
@ApiBearerAuth()
@Controller('inventory/workshop-returns')
export class WorkshopReturnController {
  constructor(private readonly service: WorkshopReturnService) {}

  @Get()
  @RequirePermission(STOCK_RETURN_READ)
  @ApiOperation({ summary: 'List workshop returns' })
  @ApiResponse({ status: 200, description: 'Paginated workshop returns' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires stock_return:read',
  })
  findAll(
    @Query() query: OrderStockDocumentFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(STOCK_RETURN_READ)
  @ApiOperation({
    summary: 'Get a workshop return with its lines',
    description: 'Line unit costs and values only with purchase_price:read.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Workshop return' })
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
    summary: 'Take back what the workshop did not use',
    description:
      'At most what the order still has out, at its net issued average cost; the stock goes back to the order first while it is open and short. A request key already used answers the first return with 200.',
  })
  @ApiBody({ type: CreateWorkshopReturnDto })
  @ApiResponse({ status: 201, description: 'Return posted' })
  @ApiResponse({
    status: 200,
    description: 'The request key was posted before: the first return',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Order or item not found' })
  @ApiResponse({
    status: 409,
    description:
      'Order neither open nor cancelled, or more than is out at the workshop',
  })
  async create(
    @Body() dto: CreateWorkshopReturnDto,
    @CurrentUser() user: AuthUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.create(dto, user);
    if (!result.created) res.status(200);
    return result.workshopReturn;
  }
}
