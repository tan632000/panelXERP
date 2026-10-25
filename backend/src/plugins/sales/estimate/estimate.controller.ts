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
  CreateBomLineDto,
  UpdateBomLineDto,
} from '@plugins/sales/estimate/dto/bom-line.dto';
import {
  CreateCostLineDto,
  UpdateCostLineDto,
} from '@plugins/sales/estimate/dto/cost-line.dto';
import { CreateEstimateDto } from '@plugins/sales/estimate/dto/create-estimate.dto';
import { EstimateFilterDto } from '@plugins/sales/estimate/dto/estimate-filter.dto';
import { EstimateRevisionQueryDto } from '@plugins/sales/estimate/dto/estimate-revision-query.dto';
import {
  CreatePanelDto,
  UpdatePanelDto,
} from '@plugins/sales/estimate/dto/panel.dto';
import {
  ESTIMATE_CREATE,
  ESTIMATE_READ,
  ESTIMATE_SUBMIT,
  ESTIMATE_UPDATE,
} from '@plugins/sales/estimate/permissions/estimate.permissions';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const NOT_FOUND =
  'Not found, or outside the caller’s data scope (also an actor who is not the assigned engineer)';
const READ_ONLY = 'The revision is submitted or superseded and read-only';

@ApiTags('sales/estimates')
@ApiBearerAuth()
@Controller('sales/estimates')
export class EstimateController {
  constructor(
    private readonly service: EstimateService,
    private readonly editor: EstimateEditService,
  ) {}

  @Get()
  @RequirePermission(ESTIMATE_READ)
  @ApiOperation({
    summary: 'List estimates',
    description:
      'Paginated list; filter by the status of the latest revision, request or engineer. The keyword matches the estimate code or the code or title of its request. A Sales actor sees the estimates of the requests they own; an Engineer those of requests assigned to them.',
  })
  @ApiResponse({ status: 200, description: 'Paginated estimate list' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires estimate:read',
  })
  findAll(
    @Query() query: EstimateFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(ESTIMATE_READ)
  @ApiOperation({
    summary: 'Get an estimate with one revision',
    description:
      'The header, the request it answers, the revision list, and the panels with BOM and cost lines of the revision asked for (the latest by default).',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Estimate found' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: EstimateRevisionQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.findOne(id, user, query.revision);
  }

  @Post()
  @RequirePermission(ESTIMATE_CREATE)
  @ApiOperation({
    summary: 'Start the estimate of a request',
    description:
      'Creates the first draft (code DT_YYYY_NNNN) and moves the request from assigned to estimating in the same transaction. Only the assigned engineer or an actor who sees every request may start it.',
  })
  @ApiBody({ type: CreateEstimateDto })
  @ApiResponse({ status: 201, description: 'Estimate created as a draft' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires estimate:create',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description: 'The request already has an estimate or is not assigned',
  })
  create(@Body() dto: CreateEstimateDto, @CurrentUser() user: AuthUserPayload) {
    return this.service.create(dto, user);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission(ESTIMATE_SUBMIT)
  @ApiOperation({
    summary: 'Submit the draft revision',
    description:
      'Freezes the draft, supersedes the previous submitted revision, moves the request to estimated in the same transaction and notifies the sales owner once.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Revision submitted' })
  @ApiResponse({
    status: 400,
    description: 'No panel, or a panel without a BOM line',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires estimate:submit',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.submit(id, user);
  }

  @Post(':id/revise')
  @HttpCode(200)
  @RequirePermission(ESTIMATE_CREATE)
  @ApiOperation({
    summary: 'Open a new draft revision',
    description:
      'Copies the latest submitted revision (BOM snapshots included) into a new draft. Only while the request is estimating or estimated.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'New draft revision' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires estimate:create',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({
    status: 409,
    description: 'A draft is already open, or the request is quoted or closed',
  })
  revise(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.revise(id, user);
  }

  @Post(':id/panels')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({
    summary: 'Add a panel to the draft',
    description: 'Returns the whole draft revision with recomputed totals.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreatePanelDto })
  @ApiResponse({ status: 201, description: 'Panel added' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires estimate:update',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: `${READ_ONLY}, or tag in use` })
  addPanel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePanelDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.addPanel(id, dto, user);
  }

  @Patch(':id/panels/:panelId')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({ summary: 'Update a panel of the draft' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'panelId', type: Number })
  @ApiBody({ type: UpdatePanelDto })
  @ApiResponse({ status: 200, description: 'Panel updated' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: `${READ_ONLY}, or tag in use` })
  updatePanel(
    @Param('id', ParseIntPipe) id: number,
    @Param('panelId', ParseIntPipe) panelId: number,
    @Body() dto: UpdatePanelDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.updatePanel(id, panelId, dto, user);
  }

  @Delete(':id/panels/:panelId')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({ summary: 'Remove a panel and its lines from the draft' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'panelId', type: Number })
  @ApiResponse({ status: 200, description: 'Panel removed' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  deletePanel(
    @Param('id', ParseIntPipe) id: number,
    @Param('panelId', ParseIntPipe) panelId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.deletePanel(id, panelId, user);
  }

  @Post(':id/panels/:panelId/bom-lines')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({
    summary: 'Add a BOM line to a panel',
    description:
      'Copies the item code, name, brand and unit onto the line; the unit cost defaults to the item reference price.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'panelId', type: Number })
  @ApiBody({ type: CreateBomLineDto })
  @ApiResponse({ status: 201, description: 'Line added' })
  @ApiResponse({ status: 400, description: 'Item is not an active item' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  addBomLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('panelId', ParseIntPipe) panelId: number,
    @Body() dto: CreateBomLineDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.addBomLine(id, panelId, dto, user);
  }

  @Patch(':id/bom-lines/:lineId')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({ summary: 'Update the quantity, unit cost or note of a line' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'lineId', type: Number })
  @ApiBody({ type: UpdateBomLineDto })
  @ApiResponse({ status: 200, description: 'Line updated' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  updateBomLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdateBomLineDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.updateBomLine(id, lineId, dto, user);
  }

  @Delete(':id/bom-lines/:lineId')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({ summary: 'Remove a BOM line from the draft' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'lineId', type: Number })
  @ApiResponse({ status: 200, description: 'Line removed' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  deleteBomLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.deleteBomLine(id, lineId, user);
  }

  @Post(':id/panels/:panelId/cost-lines')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({
    summary: 'Add a cost line to a panel',
    description: 'The amount is the cost of ONE panel.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'panelId', type: Number })
  @ApiBody({ type: CreateCostLineDto })
  @ApiResponse({ status: 201, description: 'Line added' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  addCostLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('panelId', ParseIntPipe) panelId: number,
    @Body() dto: CreateCostLineDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.addCostLine(id, panelId, dto, user);
  }

  @Patch(':id/cost-lines/:lineId')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({ summary: 'Update a cost line' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'lineId', type: Number })
  @ApiBody({ type: UpdateCostLineDto })
  @ApiResponse({ status: 200, description: 'Line updated' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  updateCostLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdateCostLineDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.updateCostLine(id, lineId, dto, user);
  }

  @Delete(':id/cost-lines/:lineId')
  @RequirePermission(ESTIMATE_UPDATE)
  @ApiOperation({ summary: 'Remove a cost line from the draft' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'lineId', type: Number })
  @ApiResponse({ status: 200, description: 'Line removed' })
  @ApiResponse({ status: 404, description: NOT_FOUND })
  @ApiResponse({ status: 409, description: READ_ONLY })
  deleteCostLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.editor.deleteCostLine(id, lineId, user);
  }
}
