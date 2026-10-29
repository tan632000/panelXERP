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
  CreateStocktakeDto,
  StocktakeCountDto,
  StocktakeFilterDto,
  StocktakeReasonDto,
  StocktakeScanDto,
} from '@plugins/inventory/stocktake/dto/stocktake.dto';
import {
  STOCKTAKE_APPROVE,
  STOCKTAKE_CANCEL,
  STOCKTAKE_CREATE,
  STOCKTAKE_READ,
  STOCKTAKE_SUBMIT,
  STOCKTAKE_UPDATE,
} from '@plugins/inventory/stocktake/permissions/stocktake.permissions';
import { StocktakeApprovalService } from '@plugins/inventory/stocktake/services/stocktake-approval.service';
import { StocktakeService } from '@plugins/inventory/stocktake/services/stocktake.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const COST_NOTE =
  'Book and counted quantities and the difference to every reader; unit costs and values only with purchase_price:read.';

@ApiTags('inventory/stocktakes')
@ApiBearerAuth()
@Controller('inventory/stocktakes')
export class StocktakeController {
  constructor(
    private readonly service: StocktakeService,
    private readonly approval: StocktakeApprovalService,
  ) {}

  @Get()
  @RequirePermission(STOCKTAKE_READ)
  @ApiOperation({ summary: 'List stock counts' })
  @ApiResponse({ status: 200, description: 'Paginated stock counts' })
  findAll(@Query() query: StocktakeFilterDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission(STOCKTAKE_READ)
  @ApiOperation({
    summary: 'Get a stock count with its lines',
    description: COST_NOTE,
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Stock count' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(STOCKTAKE_CREATE)
  @ApiOperation({
    summary: 'Open a count of the whole warehouse or one location',
  })
  @ApiBody({ type: CreateStocktakeDto })
  @ApiResponse({ status: 201, description: 'Count opened' })
  @ApiResponse({ status: 409, description: 'Another count is still open' })
  create(
    @Body() dto: CreateStocktakeDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Post(':id/scan')
  @HttpCode(200)
  @RequirePermission(STOCKTAKE_UPDATE)
  @ApiOperation({
    summary: 'Count one more of a scanned item',
    description:
      'An item without a line gets one. Records the book quantity of the moment.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: StocktakeScanDto })
  @ApiResponse({ status: 200, description: 'Counted' })
  @ApiResponse({ status: 404, description: 'Count or item not found' })
  @ApiResponse({ status: 409, description: 'The count is not being counted' })
  scan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StocktakeScanDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.scan(id, dto.code, user);
  }

  @Patch(':id/lines/:itemId')
  @RequirePermission(STOCKTAKE_UPDATE)
  @ApiOperation({ summary: 'Set the counted quantity of an item on the count' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'itemId', type: Number })
  @ApiBody({ type: StocktakeCountDto })
  @ApiResponse({ status: 200, description: 'Counted' })
  @ApiResponse({ status: 404, description: 'Count or line not found' })
  @ApiResponse({ status: 409, description: 'The count is not being counted' })
  setCount(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: StocktakeCountDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.setCount(id, itemId, dto.countedQty, user);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission(STOCKTAKE_SUBMIT)
  @ApiOperation({ summary: 'Submit a count for approval' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Submitted' })
  @ApiResponse({ status: 409, description: 'Not being counted' })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.submit(id, user);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission(STOCKTAKE_APPROVE)
  @ApiOperation({
    summary: 'Approve a submitted count and post its differences',
    description:
      'Refused to its creator, every submitter and every counter. A result below zero refuses the whole count.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Approved and posted' })
  @ApiResponse({ status: 403, description: 'The actor took part in the count' })
  @ApiResponse({
    status: 409,
    description: 'Not submitted, or an item would go below zero',
  })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission(STOCKTAKE_APPROVE)
  @ApiOperation({ summary: 'Send a submitted count back to counting' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: StocktakeReasonDto })
  @ApiResponse({ status: 200, description: 'Back to counting' })
  @ApiResponse({ status: 403, description: 'The actor took part in the count' })
  @ApiResponse({ status: 409, description: 'Not submitted' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StocktakeReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.reject(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(STOCKTAKE_CANCEL)
  @ApiOperation({ summary: 'Cancel an open count' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: StocktakeReasonDto })
  @ApiResponse({ status: 200, description: 'Cancelled' })
  @ApiResponse({ status: 409, description: 'Not open' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StocktakeReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approval.cancel(id, dto, user);
  }
}
