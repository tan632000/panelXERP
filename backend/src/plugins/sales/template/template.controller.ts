import {
  Body,
  Controller,
  Delete,
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
  CreateQuotationTemplateDto,
  QuotationTemplateFilterDto,
  UpdateQuotationTemplateDto,
} from '@plugins/sales/template/dto/quotation-template.dto';
import {
  QUOTATION_TEMPLATE_CREATE,
  QUOTATION_TEMPLATE_DELETE,
  QUOTATION_TEMPLATE_READ,
  QUOTATION_TEMPLATE_UPDATE,
} from '@plugins/sales/template/permissions/quotation-template.permissions';
import { QuotationTemplateService } from '@plugins/sales/template/services/quotation-template.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const NOT_FOUND = 'Template not found.';

@ApiTags('sales/quotation-templates')
@ApiBearerAuth()
@Controller('sales/quotation-templates')
export class TemplateController {
  constructor(private readonly service: QuotationTemplateService) {}

  @Get()
  @RequirePermission(QUOTATION_TEMPLATE_READ)
  @ApiOperation({
    summary: 'List quotation templates',
    description:
      'Paginated; filter by active state. The keyword matches the code or the name.',
  })
  @ApiResponse({ status: 200, description: 'Paginated template list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation_template:read',
  })
  findAll(@Query() query: QuotationTemplateFilterDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission(QUOTATION_TEMPLATE_READ)
  @ApiOperation({
    summary: 'Get a template with its panels and lines',
    description:
      'Each line carries the code, name, brand and unit of its item.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Template found' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission(QUOTATION_TEMPLATE_CREATE)
  @ApiOperation({
    summary: 'Create a template',
    description:
      'Code (TPL_xxxx) must be unique among live templates; panel tags unique within the template.',
  })
  @ApiBody({ type: CreateQuotationTemplateDto })
  @ApiResponse({ status: 201, description: 'Template created' })
  @ApiResponse({
    status: 400,
    description: 'Validation error, or a line names an item that is not live',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation_template:create',
  })
  @ApiResponse({ status: 409, description: 'Duplicate code or panel tag' })
  create(
    @Body() dto: CreateQuotationTemplateDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(QUOTATION_TEMPLATE_UPDATE)
  @ApiOperation({
    summary: 'Update a template',
    description:
      'The code is immutable. When `panels` is sent it replaces every panel and line in one transaction.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateQuotationTemplateDto })
  @ApiResponse({ status: 200, description: 'Template updated' })
  @ApiResponse({
    status: 400,
    description: 'Validation error, or a line names an item that is not live',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation_template:update',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'Duplicate panel tag' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuotationTemplateDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission(QUOTATION_TEMPLATE_UPDATE)
  @ApiOperation({
    summary: 'Deactivate a template',
    description: 'An inactive template can no longer be picked by a project.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Template deactivated' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.setActive(id, false, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermission(QUOTATION_TEMPLATE_UPDATE)
  @ApiOperation({ summary: 'Activate a template' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Template activated' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.setActive(id, true, user);
  }

  @Delete(':id')
  @RequirePermission(QUOTATION_TEMPLATE_DELETE)
  @ApiOperation({ summary: 'Soft-delete a template' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Template soft-deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation_template:delete',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.remove(id, user);
  }
}
