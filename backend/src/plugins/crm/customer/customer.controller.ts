import {
  Body,
  Controller,
  Delete,
  Get,
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

import { BulkDeleteEndpoint } from '@shared/decorators/bulk-delete-endpoint.decorator';
import { ColumnValuesEndpoint } from '@shared/decorators/column-values-endpoint.decorator';
import { BulkDeleteDto } from '@shared/dto/bulk-delete.dto';
import { columnFilterKeys } from '@shared/utils/column-filter.util';

import { CreateCustomerDto } from '@plugins/crm/customer/dto/create-customer.dto';
import {
  CustomerColumnValuesQueryDto,
  CustomerFilterDto,
} from '@plugins/crm/customer/dto/customer-filter.dto';
import { UpdateCustomerDto } from '@plugins/crm/customer/dto/update-customer.dto';
import {
  CUSTOMER_CREATE,
  CUSTOMER_DELETE,
  CUSTOMER_READ,
  CUSTOMER_UPDATE,
} from '@plugins/crm/customer/permissions/customer.permissions';
import {
  CUSTOMER_COLUMN_FILTERS,
  CustomerService,
} from '@plugins/crm/customer/services/customer.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('crm/customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Get()
  @RequirePermission(CUSTOMER_READ)
  @ApiOperation({
    summary: 'List customers',
    description:
      'Paginated customer list with search and column filters. A Sales actor sees only the customers they own.',
  })
  @ApiResponse({ status: 200, description: 'Paginated customer list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires customer:read',
  })
  findAll(
    @Query() query: CustomerFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @ColumnValuesEndpoint({
    permission: CUSTOMER_READ,
    columns: columnFilterKeys(CUSTOMER_COLUMN_FILTERS),
    subject: 'customer',
  })
  findColumnValues(
    @Query() query: CustomerColumnValuesQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findColumnValues(query, user);
  }

  @Get('next-code')
  @RequirePermission(CUSTOMER_CREATE)
  @ApiOperation({
    summary: 'Preview next customer code',
    description:
      'Returns the next suggested KH_xxxx code without reserving it. The code stays editable on create.',
  })
  @ApiResponse({ status: 200, description: 'Next suggested code' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires customer:create',
  })
  getNextCode() {
    return this.service.getNextCode();
  }

  @Get('owner-options')
  @RequirePermission(CUSTOMER_CREATE, CUSTOMER_UPDATE)
  @ApiOperation({
    summary: 'List the accounts a customer may be assigned to',
    description:
      'Sales accounts for an actor who sees every customer; only the caller otherwise.',
  })
  @ApiResponse({ status: 200, description: 'Owner options' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires customer:create or customer:update',
  })
  listOwnerOptions(@CurrentUser() user: AuthUserPayload) {
    return this.service.listOwnerOptions(user);
  }

  @Get(':id')
  @RequirePermission(CUSTOMER_READ)
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({
    status: 404,
    description: 'Not found, soft-deleted or owned by another sales account',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission(CUSTOMER_CREATE)
  @ApiOperation({
    summary: 'Create customer',
    description:
      'Code must be unique among active customers. The owner defaults to the caller; only an actor who sees every customer may name another sales account.',
  })
  @ApiBody({ type: CreateCustomerDto })
  @ApiResponse({ status: 201, description: 'Customer created' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or owner not allowed',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires customer:create',
  })
  @ApiResponse({ status: 409, description: 'Duplicate customer code' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(CUSTOMER_UPDATE)
  @ApiOperation({
    summary: 'Update customer',
    description:
      'Code is immutable. Reassigning the owner needs full customer scope.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateCustomerDto })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires customer:update',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission(CUSTOMER_DELETE)
  @ApiOperation({
    summary: 'Soft-delete customer',
    description:
      'Refused with 409 while any sales document references the customer.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Customer soft-deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires customer:delete',
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({
    status: 409,
    description: 'Customer is referenced by a document',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, user);
  }

  @BulkDeleteEndpoint({ permission: CUSTOMER_DELETE, subject: 'customers' })
  bulkRemove(@Body() dto: BulkDeleteDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.removeMany(dto.ids, user);
  }
}
