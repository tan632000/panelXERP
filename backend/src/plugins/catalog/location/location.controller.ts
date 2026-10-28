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

import { CreateLocationDto } from '@plugins/catalog/location/dto/create-location.dto';
import {
  LocationColumnValuesQueryDto,
  LocationFilterDto,
} from '@plugins/catalog/location/dto/location-filter.dto';
import { UpdateLocationDto } from '@plugins/catalog/location/dto/update-location.dto';
import {
  LOCATION_CREATE,
  LOCATION_DELETE,
  LOCATION_READ,
  LOCATION_UPDATE,
} from '@plugins/catalog/location/permissions/location.permissions';
import {
  LOCATION_COLUMN_FILTERS,
  LocationService,
} from '@plugins/catalog/location/services/location.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('catalog/locations')
@ApiBearerAuth()
@Controller('catalog/locations')
export class LocationController {
  constructor(private readonly service: LocationService) {}

  @Get()
  @RequirePermission(LOCATION_READ)
  @ApiOperation({
    summary: 'List locations',
    description: 'Paginated location list with search and column filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated location list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires location:read',
  })
  findAll(@Query() query: LocationFilterDto) {
    return this.service.findAll(query);
  }

  @ColumnValuesEndpoint({
    permission: LOCATION_READ,
    columns: columnFilterKeys(LOCATION_COLUMN_FILTERS),
    subject: 'location',
  })
  findColumnValues(@Query() query: LocationColumnValuesQueryDto) {
    return this.service.findColumnValues(query);
  }

  @Get(':id')
  @RequirePermission(LOCATION_READ)
  @ApiOperation({ summary: 'Get location by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Location found' })
  @ApiResponse({ status: 404, description: 'Not found or soft-deleted' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission(LOCATION_CREATE)
  @ApiOperation({
    summary: 'Create location',
    description: 'Code must be unique among active locations, in any case.',
  })
  @ApiBody({ type: CreateLocationDto })
  @ApiResponse({ status: 201, description: 'Location created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires location:create',
  })
  @ApiResponse({ status: 409, description: 'Duplicate location code' })
  create(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(LOCATION_UPDATE)
  @ApiOperation({ summary: 'Update location' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateLocationDto })
  @ApiResponse({ status: 200, description: 'Location updated' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires location:update',
  })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({ status: 409, description: 'Duplicate location code' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission(LOCATION_DELETE)
  @ApiOperation({
    summary: 'Soft-delete location',
    description:
      'Refused with 409 while an active item has the location as its default.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Location soft-deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires location:delete',
  })
  @ApiResponse({ status: 404, description: 'Location not found' })
  @ApiResponse({
    status: 409,
    description: 'Location is the default location of an item',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, user);
  }

  @BulkDeleteEndpoint({ permission: LOCATION_DELETE, subject: 'locations' })
  bulkRemove(@Body() dto: BulkDeleteDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.removeMany(dto.ids, user);
  }
}
