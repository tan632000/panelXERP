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

import { ColumnValuesEndpoint } from '@shared/decorators/column-values-endpoint.decorator';
import { columnFilterKeys } from '@shared/utils/column-filter.util';

import { AssignRequestDto } from '@plugins/sales/request/dto/assign-request.dto';
import { CreateRequestDto } from '@plugins/sales/request/dto/create-request.dto';
import {
  RequestColumnValuesQueryDto,
  RequestFilterDto,
} from '@plugins/sales/request/dto/request-filter.dto';
import { RequestReasonDto } from '@plugins/sales/request/dto/request-reason.dto';
import { UpdateRequestDto } from '@plugins/sales/request/dto/update-request.dto';
import {
  REQUEST_ASSIGN,
  REQUEST_CANCEL,
  REQUEST_CREATE,
  REQUEST_READ,
  REQUEST_UPDATE,
} from '@plugins/sales/request/permissions/request.permissions';
import {
  REQUEST_COLUMN_FILTERS,
  RequestService,
} from '@plugins/sales/request/services/request.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('sales/requests')
@ApiBearerAuth()
@Controller('sales/requests')
export class RequestController {
  constructor(private readonly service: RequestService) {}

  @Get()
  @RequirePermission(REQUEST_READ)
  @ApiOperation({
    summary: 'List quote requests',
    description:
      'Paginated request list with search, status, engineer and quotation-due filters. A Sales actor sees only the requests they own; an Engineer only the requests assigned to them.',
  })
  @ApiResponse({ status: 200, description: 'Paginated request list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:read',
  })
  findAll(
    @Query() query: RequestFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @ColumnValuesEndpoint({
    permission: REQUEST_READ,
    columns: columnFilterKeys(REQUEST_COLUMN_FILTERS),
    subject: 'request',
  })
  findColumnValues(
    @Query() query: RequestColumnValuesQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findColumnValues(query, user);
  }

  @Get('engineer-options')
  @RequirePermission(REQUEST_ASSIGN)
  @ApiOperation({
    summary: 'List the accounts a request may be assigned to',
    description: 'Active engineers and engineering leads.',
  })
  @ApiResponse({ status: 200, description: 'Engineer options' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:assign',
  })
  listEngineerOptions() {
    return this.service.listEngineerOptions();
  }

  @Get(':id')
  @RequirePermission(REQUEST_READ)
  @ApiOperation({
    summary: 'Get quote request by ID',
    description:
      'Embeds the customer, project and contact summary, so an assigned engineer sees them without customer or project read permission.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Request found' })
  @ApiResponse({
    status: 404,
    description: 'Not found, or outside the caller’s data scope',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Get(':id/activities')
  @RequirePermission(REQUEST_READ)
  @ApiOperation({ summary: 'Timeline of a quote request' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Timeline, oldest first' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  listActivities(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.listActivities(id, user);
  }

  @Post()
  @RequirePermission(REQUEST_CREATE)
  @ApiOperation({
    summary: 'Create quote request',
    description:
      'The code (YC_YYYY_NNNN) is generated. The customer must be visible to the caller; project and contact must belong to it. The owner defaults to the caller; only an actor who sees every request may name another sales account.',
  })
  @ApiBody({ type: CreateRequestDto })
  @ApiResponse({ status: 201, description: 'Request created as a draft' })
  @ApiResponse({
    status: 400,
    description:
      'Validation error, foreign project or contact, owner not allowed',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:create',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(REQUEST_UPDATE)
  @ApiOperation({
    summary: 'Update quote request',
    description:
      'Only while the request is a draft or assigned. Code and customer are immutable.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateRequestDto })
  @ApiResponse({ status: 200, description: 'Request updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:update',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 409, description: 'Request can no longer be edited' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRequestDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission(REQUEST_ASSIGN)
  @ApiOperation({
    summary: 'Assign or reassign the engineer',
    description:
      'The first assignment moves a draft to assigned. The engineer is notified once, after the change is saved.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: AssignRequestDto })
  @ApiResponse({ status: 200, description: 'Request assigned' })
  @ApiResponse({
    status: 400,
    description: 'Engineer is not an active engineer or engineering lead',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:assign',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({
    status: 409,
    description: 'Request can no longer be assigned',
  })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRequestDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.assign(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(REQUEST_CANCEL)
  @ApiOperation({
    summary: 'Cancel a quote request',
    description: 'Needs a reason. Possible until the request has been quoted.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RequestReasonDto })
  @ApiResponse({ status: 200, description: 'Request cancelled' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:cancel',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({
    status: 409,
    description: 'Request can no longer be cancelled',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.cancel(id, dto, user);
  }

  @Post(':id/lost')
  @HttpCode(200)
  @RequirePermission(REQUEST_CANCEL)
  @ApiOperation({
    summary: 'Mark a quote request lost',
    description:
      'Needs a reason. Possible once the request is estimated or quoted.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RequestReasonDto })
  @ApiResponse({ status: 200, description: 'Request marked lost' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires request:cancel',
  })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiResponse({ status: 409, description: 'Request cannot be lost from here' })
  markLost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.markLost(id, dto, user);
  }
}
