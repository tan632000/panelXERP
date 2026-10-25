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
  StreamableFile,
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

import { buildAttachmentContentDisposition } from '@shared/utils/content-disposition.util';

import { CreateQuotationFeedbackDto } from '@plugins/sales/quotation/dto/create-quotation-feedback.dto';
import { CreateQuotationDto } from '@plugins/sales/quotation/dto/create-quotation.dto';
import { QuotationFilterDto } from '@plugins/sales/quotation/dto/quotation-filter.dto';
import { QuotationVersionQueryDto } from '@plugins/sales/quotation/dto/quotation-version-query.dto';
import { UpdateQuotationPricingDto } from '@plugins/sales/quotation/dto/update-quotation-pricing.dto';
import {
  QUOTATION_APPROVE,
  QUOTATION_CANCEL,
  QUOTATION_CONFIRM,
  QUOTATION_CREATE,
  QUOTATION_EXPORT,
  QUOTATION_READ,
  QUOTATION_SUBMIT,
  QUOTATION_UPDATE,
} from '@plugins/sales/quotation/permissions/quotation.permissions';
import { QuotationApprovalService } from '@plugins/sales/quotation/services/quotation-approval.service';
import { QuotationFeedbackService } from '@plugins/sales/quotation/services/quotation-feedback.service';
import {
  QuotationPdfService,
  type QuotationExportFile,
} from '@plugins/sales/quotation/services/quotation-pdf.service';
import { QuotationVersionService } from '@plugins/sales/quotation/services/quotation-version.service';
import { QuotationService } from '@plugins/sales/quotation/services/quotation.service';
import { RequestReasonDto } from '@plugins/sales/request/dto/request-reason.dto';

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
    private readonly approvals: QuotationApprovalService,
    private readonly feedback: QuotationFeedbackService,
    private readonly exports: QuotationPdfService,
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
    summary: 'Set margins, discount, VAT and terms of the draft version',
    description:
      'Only what the body names changes; margins are per line (0–1000%), the discount a percent (0–100) or an amount not above the subtotal, VAT one of 0/5/8/10, and the terms replace the printed list. The server recomputes and stores every total.',
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

  @Post(':id/refresh-estimate')
  @HttpCode(200)
  @RequirePermission(QUOTATION_UPDATE)
  @ApiOperation({
    summary: 'Update the draft from the latest submitted estimate',
    description:
      'Rebuilds the draft panel lines and frozen BOM from the latest submitted estimate revision, keeping the margin of every panel whose tag still exists. Discount, VAT and terms stay. A draft already on the latest revision is returned unchanged.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Draft refreshed' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:update',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description:
      'The latest version is not a draft, or no estimate is submitted',
  })
  refreshEstimate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.versions.refreshEstimate(id, user);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission(QUOTATION_SUBMIT)
  @ApiOperation({
    summary: 'Submit the draft for approval',
    description:
      'draft → pending_approval, by the version creator or a manager; the approvers are notified after the commit. A draft built on an estimate revision that is no longer the latest submitted one answers 409.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Submitted for approval' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden — requires quotation:submit, and the version creator or a manager',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description: 'Not a draft, or the estimate was revised since',
  })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approvals.submit(id, user);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission(QUOTATION_APPROVE)
  @ApiOperation({
    summary: 'Approve the version',
    description:
      'pending_approval → approved in one step, by someone other than the version creator. The first approval moves the request from estimated to quoted in the same transaction; the sales owner is notified after the commit.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Approved' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden — requires quotation:approve, and not the version creator',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'Not pending approval' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approvals.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission(QUOTATION_APPROVE)
  @ApiOperation({
    summary: 'Reject the version',
    description:
      'pending_approval → rejected with a reason, by someone other than the version creator. The version stays as it was; Sales revises it into the next version.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RequestReasonDto })
  @ApiResponse({ status: 200, description: 'Rejected' })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden — requires quotation:approve, and not the version creator',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'Not pending approval' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approvals.reject(id, dto, user);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission(QUOTATION_CONFIRM)
  @ApiOperation({
    summary: 'Record that the customer accepted',
    description: 'approved → customer_confirmed; any other status answers 409.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Confirmed by the customer' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:confirm',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'Not approved' })
  confirm(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approvals.confirm(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(QUOTATION_CANCEL)
  @ApiOperation({
    summary: 'Cancel the quotation',
    description:
      'From draft, pending_approval, approved or rejected: the version becomes cancelled and the request lost, with the reason, in one transaction. A confirmed or already cancelled quotation answers 409.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RequestReasonDto })
  @ApiResponse({ status: 200, description: 'Cancelled; the request is lost' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:cancel',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description:
      'Confirmed, cancelled or closed, or the request cannot be lost',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestReasonDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.approvals.cancel(id, dto, user);
  }

  @Get(':id/feedback')
  @RequirePermission(QUOTATION_READ)
  @ApiOperation({
    summary: 'List the customer feedback of a quotation',
    description: 'Newest first: date, channel, content and who recorded it.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The feedback log' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  listFeedback(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.feedback.list(id, user);
  }

  @Post(':id/feedback')
  @RequirePermission(QUOTATION_UPDATE)
  @ApiOperation({
    summary: 'Record what the customer answered',
    description: 'Appends one entry to the feedback log of the quotation.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreateQuotationFeedbackDto })
  @ApiResponse({ status: 201, description: 'Feedback recorded' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:update',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  addFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateQuotationFeedbackDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.feedback.add(id, dto, user);
  }

  @Get(':id/export.xlsx')
  @RequirePermission(QUOTATION_EXPORT)
  @ApiOperation({
    summary: 'Download the customer-facing quotation as .xlsx',
    description:
      'The BẢNG CHÀO GIÁ sheet of the approved or customer-confirmed newest version, in the company layout.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The workbook' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:export',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'Not approved or confirmed' })
  async exportXlsx(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ): Promise<StreamableFile> {
    return this.download(await this.exports.exportXlsx(id, user));
  }

  @Get(':id/export.pdf')
  @RequirePermission(QUOTATION_EXPORT)
  @ApiOperation({
    summary: 'Download the customer-facing quotation as PDF',
    description:
      'The BẢNG CHÀO GIÁ sheet of the approved or customer-confirmed newest version, in the company layout.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The PDF' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires quotation:export',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: 'Not approved or confirmed' })
  async exportPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ): Promise<StreamableFile> {
    return this.download(await this.exports.exportPdf(id, user));
  }

  private download(file: QuotationExportFile): StreamableFile {
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: buildAttachmentContentDisposition(file.fileName),
      length: file.body.length,
    });
  }
}
