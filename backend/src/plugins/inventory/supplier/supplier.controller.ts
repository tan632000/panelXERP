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

import { CreateSupplierDto } from '@plugins/inventory/supplier/dto/create-supplier.dto';
import {
  SupplierColumnValuesQueryDto,
  SupplierFilterDto,
} from '@plugins/inventory/supplier/dto/supplier-filter.dto';
import { UpdateSupplierDto } from '@plugins/inventory/supplier/dto/update-supplier.dto';
import {
  SUPPLIER_CREATE,
  SUPPLIER_DELETE,
  SUPPLIER_READ,
  SUPPLIER_UPDATE,
} from '@plugins/inventory/supplier/permissions/supplier.permissions';
import {
  SUPPLIER_COLUMN_FILTERS,
  SupplierService,
} from '@plugins/inventory/supplier/services/supplier.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('inventory/suppliers')
@ApiBearerAuth()
@Controller('inventory/suppliers')
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Get()
  @RequirePermission(SUPPLIER_READ)
  @ApiOperation({
    summary: 'List suppliers',
    description: 'Paginated supplier list with search and column filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated supplier list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires supplier:read',
  })
  findAll(@Query() query: SupplierFilterDto) {
    return this.service.findAll(query);
  }

  @ColumnValuesEndpoint({
    permission: SUPPLIER_READ,
    columns: columnFilterKeys(SUPPLIER_COLUMN_FILTERS),
    subject: 'supplier',
  })
  findColumnValues(@Query() query: SupplierColumnValuesQueryDto) {
    return this.service.findColumnValues(query);
  }

  @Get(':id')
  @RequirePermission(SUPPLIER_READ)
  @ApiOperation({ summary: 'Get supplier by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Supplier found' })
  @ApiResponse({ status: 404, description: 'Not found or soft-deleted' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission(SUPPLIER_CREATE)
  @ApiOperation({
    summary: 'Create supplier',
    description: 'Code must be unique among active suppliers, in any case.',
  })
  @ApiBody({ type: CreateSupplierDto })
  @ApiResponse({ status: 201, description: 'Supplier created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires supplier:create',
  })
  @ApiResponse({ status: 409, description: 'Duplicate supplier code' })
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(SUPPLIER_UPDATE)
  @ApiOperation({ summary: 'Update supplier' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateSupplierDto })
  @ApiResponse({ status: 200, description: 'Supplier updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires supplier:update',
  })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiResponse({ status: 409, description: 'Duplicate supplier code' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission(SUPPLIER_DELETE)
  @ApiOperation({
    summary: 'Soft-delete supplier',
    description:
      'Refused with 409 while any purchasing document references the supplier.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Supplier soft-deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires supplier:delete',
  })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  @ApiResponse({
    status: 409,
    description: 'Supplier is referenced by a document',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, user);
  }

  @BulkDeleteEndpoint({ permission: SUPPLIER_DELETE, subject: 'suppliers' })
  bulkRemove(@Body() dto: BulkDeleteDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.removeMany(dto.ids, user);
  }
}
