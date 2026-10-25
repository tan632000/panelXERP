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

import { CreateQuotationDto } from '@plugins/sales/quotation/dto/create-quotation.dto';
import { QuotationFilterDto } from '@plugins/sales/quotation/dto/quotation-filter.dto';
import { QuotationVersionQueryDto } from '@plugins/sales/quotation/dto/quotation-version-query.dto';
import { UpdateQuotationPricingDto } from '@plugins/sales/quotation/dto/update-quotation-pricing.dto';
import {
  QUOTATION_CREATE,
  QUOTATION_READ,
  QUOTATION_UPDATE,
} from '@plugins/sales/quotation/permissions/quotation.permissions';
import { QuotationVersionService } from '@plugins/sales/quotation/services/quotation-version.service';
import { QuotationService } from '@plugins/sales/quotation/services/quotation.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const NOT_FOUND =
  'Not found, or outside the caller’s data scope (a Sales actor reads the quotations of requests they own)';

@ApiTags('sales/quotations')
@ApiBearerAuth()
@Controller('sales/quotations')
export class QuotationController {
  constructor(
    private readonly service: QuotationService,
    private readonly versions: QuotationVersionService,
  ) {}

  @Get()
  @RequirePermission(QUOTATION_READ)
  @ApiOperation({
    summary: 'List quotations',
    description:
      'Paginated list with the request and the latest version of each; filter by the latest version status, code, customer or request. The keyword matches the quotation code or the code or title of its request. A Sales actor sees the quotations of the requests they own.',
  })
  @ApiResponse({ status: 200, description: 'Paginated quotation list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:read',
  })
  findAll(
    @Query() query: QuotationFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(QUOTATION_READ)
  @ApiOperation({
    summary: 'Get a quotation with one version',
    description:
      'The header, the request it answers, the version list, and the lines with their frozen BOM and cost-line copies of the version asked for (the latest by default).',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Quotation found' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QuotationVersionQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user, query.ver);
  }

  @Post()
  @RequirePermission(QUOTATION_CREATE)
  @ApiOperation({
    summary: 'Quote an estimated request',
    description:
      'Builds version 1 (draft, code NN-ddmmyyyy/BG) from the latest submitted estimate revision and leaves the request estimated. A revision that is not the latest submitted one, a request not estimated, or a request that already has a quotation answer 409.',
  })
  @ApiBody({ type: CreateQuotationDto })
  @ApiResponse({ status: 201, description: 'Quotation created as a draft' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:create',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description:
      'No submitted estimate, not the latest revision, request not estimated, or a quotation exists',
  })
  create(
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission(QUOTATION_UPDATE)
  @ApiOperation({
    summary: 'Set margins, discount and VAT of the draft version',
    description:
      'Only what the body names changes; margins are per line (0–1000%), the discount a percent (0–100) or an amount not above the subtotal, VAT one of 0/5/8/10. The server recomputes and stores every total.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateQuotationPricingDto })
  @ApiResponse({ status: 200, description: 'Pricing updated' })
  @ApiResponse({
    status: 400,
    description: 'Invalid figure, or a discount above the subtotal',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:update',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description: 'The latest version is not a draft',
  })
  updatePricing(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuotationPricingDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.versions.updatePricing(id, dto, user);
  }

  @Post(':id/revise')
  @HttpCode(200)
  @RequirePermission(QUOTATION_UPDATE)
  @ApiOperation({
    summary: 'Revise the quotation',
    description:
      'Opens the next version as a draft copying the latest one and closes the latest. Allowed only from pending_approval, approved or rejected; two concurrent revises produce exactly one new version.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'New draft version opened' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:update',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description:
      'The latest version is a draft, confirmed, cancelled or closed, or changed meanwhile',
  })
  revise(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.versions.revise(id, user);
  }
}
