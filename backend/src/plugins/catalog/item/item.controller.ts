import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermission,
} from '@kernel/core/auth/decorators/auth.decorators';
import { ExcelUploadLimitInterceptor } from '@kernel/core/files/excel.controller';

import {
  EXCEL_IMPORT_MAX_FILE_BYTES,
  EXCEL_XLSX_CONTENT_TYPE,
} from '@shared/constants/excel';
import { BulkDeleteEndpoint } from '@shared/decorators/bulk-delete-endpoint.decorator';
import { ColumnValuesEndpoint } from '@shared/decorators/column-values-endpoint.decorator';
import { BulkDeleteDto } from '@shared/dto/bulk-delete.dto';
import { columnFilterKeys } from '@shared/utils/column-filter.util';

import { CreateItemDto } from '@plugins/catalog/item/dto/create-item.dto';
import {
  ItemColumnValuesQueryDto,
  ItemFilterDto,
} from '@plugins/catalog/item/dto/item-filter.dto';
import { UpdateItemDto } from '@plugins/catalog/item/dto/update-item.dto';
import {
  ITEM_CREATE,
  ITEM_DELETE,
  ITEM_IMPORT,
  ITEM_READ,
  ITEM_UPDATE,
} from '@plugins/catalog/item/permissions/item.permissions';
import { ItemImportService } from '@plugins/catalog/item/services/item-import.service';
import {
  ITEM_COLUMN_FILTERS,
  ItemService,
} from '@plugins/catalog/item/services/item.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('catalog/items')
@ApiBearerAuth()
@Controller('items')
export class ItemController {
  constructor(
    private readonly service: ItemService,
    private readonly importService: ItemImportService,
  ) {}

  @Get()
  @RequirePermission(ITEM_READ)
  @ApiOperation({
    summary: 'List items',
    description: 'Paginated item list with search and column filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated item list' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires item:read' })
  findAll(@Query() query: ItemFilterDto) {
    return this.service.findAll(query);
  }

  @ColumnValuesEndpoint({
    permission: ITEM_READ,
    columns: columnFilterKeys(ITEM_COLUMN_FILTERS),
    subject: 'item',
  })
  findColumnValues(@Query() query: ItemColumnValuesQueryDto) {
    return this.service.findColumnValues(query);
  }

  @Get('import-template')
  @RequirePermission(ITEM_IMPORT)
  @Header('Content-Type', EXCEL_XLSX_CONTENT_TYPE)
  @Header(
    'Content-Disposition',
    'attachment; filename="item-import-template.xlsx"',
  )
  @ApiOperation({
    summary: 'Download the item import template',
    description:
      'An .xlsx with the header row the import reads: STT, MÔ TẢ, MÃ HÀNG, HÃNG SẢN XUẤT, ĐV TÍNH, ĐƠN GIÁ (VNĐ), NHÓM, QUY CÁCH, GHI CHÚ.',
  })
  @ApiResponse({ status: 200, description: 'The template workbook' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires item:import' })
  async importTemplate(): Promise<StreamableFile> {
    return new StreamableFile(await this.importService.buildTemplate());
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission(ITEM_IMPORT)
  @UseInterceptors(
    // Multer's 413 for an oversize file is re-issued as a 400, like every other file problem.
    ExcelUploadLimitInterceptor,
    FileInterceptor('file', {
      limits: { fileSize: EXCEL_IMPORT_MAX_FILE_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Import items from an Excel quotation sheet',
    description:
      'Reads the first worksheet of an .xlsx (max 5 MB, 2000 data rows). The header row is found within the first 50 rows by its "MÔ TẢ" and "MÃ HÀNG" cells. Every row is validated first; valid rows are inserted in one transaction and invalid rows are reported by sheet row.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Created count and the rows that were rejected',
  })
  @ApiResponse({
    status: 400,
    description: 'Not an .xlsx, too large, no header row or no data rows',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires item:import' })
  @ApiResponse({ status: 409, description: 'Import rolled back' })
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.importService.import(file, user);
  }

  @Get(':id')
  @RequirePermission(ITEM_READ)
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Item found' })
  @ApiResponse({ status: 404, description: 'Not found or soft-deleted' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission(ITEM_CREATE)
  @ApiOperation({
    summary: 'Create item',
    description: 'Code must be unique among active items (case-insensitive).',
  })
  @ApiBody({ type: CreateItemDto })
  @ApiResponse({ status: 201, description: 'Item created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires item:create' })
  @ApiResponse({ status: 409, description: 'Duplicate item code' })
  create(@Body() dto: CreateItemDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(ITEM_UPDATE)
  @ApiOperation({
    summary: 'Update item',
    description: 'The code is immutable.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateItemDto })
  @ApiResponse({ status: 200, description: 'Item updated' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or attempt to change the code',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires item:update' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission(ITEM_DELETE)
  @ApiOperation({
    summary: 'Soft-delete item',
    description:
      'Refused with 409 while any sales document references the item.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Item soft-deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires item:delete' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 409, description: 'Item is referenced by a document' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, user);
  }

  @BulkDeleteEndpoint({ permission: ITEM_DELETE, subject: 'items' })
  bulkRemove(@Body() dto: BulkDeleteDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.removeMany(dto.ids, user);
  }
}
