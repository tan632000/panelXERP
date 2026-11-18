import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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
  CreateQcRoundDto,
  FixQcDefectDto,
  QcDefectFilterDto,
  QcUnitFilterDto,
} from '@plugins/delivery/qc-inspection/dto/qc-inspection.dto';
import {
  QC_INSPECTION_CREATE,
  QC_INSPECTION_FIX,
  QC_INSPECTION_READ,
  QC_INSPECTION_VERIFY,
} from '@plugins/delivery/qc-inspection/permissions/qc-inspection.permissions';
import { QcDefectService } from '@plugins/delivery/qc-inspection/services/qc-defect.service';
import { QcInspectionService } from '@plugins/delivery/qc-inspection/services/qc-inspection.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('delivery/qc-inspection')
@ApiBearerAuth()
@Controller('delivery/qc')
export class QcInspectionController {
  constructor(
    private readonly inspections: QcInspectionService,
    private readonly defects: QcDefectService,
  ) {}

  @Get('units')
  @RequirePermission(QC_INSPECTION_READ)
  @ApiOperation({
    summary: 'List cabinets with their QC status',
    description:
      'Cabinets of the orders the caller’s data scope reaches; the QC status is not_ready, waiting, failed or passed.',
  })
  @ApiResponse({ status: 200, description: 'A page of cabinets' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_inspection:read',
  })
  listUnits(
    @Query() query: QcUnitFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.inspections.listUnits(query, user);
  }

  @Get('units/:unitId')
  @RequirePermission(QC_INSPECTION_READ)
  @ApiOperation({ summary: 'One cabinet with its QC rounds and defects' })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiResponse({ status: 200, description: 'The cabinet, rounds and defects' })
  @ApiResponse({
    status: 404,
    description: 'No such cabinet in the caller’s scope',
  })
  getUnit(
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.inspections.getUnit(unitId, user);
  }

  @Post('units/:unitId/rounds')
  @RequirePermission(QC_INSPECTION_CREATE)
  @ApiOperation({
    summary: 'Record a QC round',
    description:
      'One result per active checklist item. A failed item needs a note and opens one defect.',
  })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiBody({ type: CreateQcRoundDto })
  @ApiResponse({ status: 201, description: 'The cabinet with its new round' })
  @ApiResponse({ status: 400, description: 'A failed item has no note' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_inspection:create',
  })
  @ApiResponse({
    status: 404,
    description: 'No such cabinet in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description:
      'Cabinet not ready, already passed, has an unverified defect, or the checklist changed',
  })
  createRound(
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: CreateQcRoundDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.inspections.createRound(unitId, dto, user);
  }

  @Get('defects')
  @RequirePermission(QC_INSPECTION_READ)
  @ApiOperation({ summary: 'List QC defects' })
  @ApiResponse({ status: 200, description: 'A page of defects' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_inspection:read',
  })
  listDefects(
    @Query() query: QcDefectFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.defects.list(query, user);
  }

  @Post('defects/:id/fix')
  @HttpCode(200)
  @RequirePermission(QC_INSPECTION_FIX)
  @ApiOperation({ summary: 'Mark an open defect fixed' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: FixQcDefectDto })
  @ApiResponse({ status: 200, description: 'The defect' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_inspection:fix',
  })
  @ApiResponse({
    status: 404,
    description: 'No such defect in the caller’s scope',
  })
  @ApiResponse({ status: 409, description: 'The defect is not open' })
  fix(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FixQcDefectDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.defects.fix(id, dto, user);
  }

  @Post('defects/:id/verify')
  @HttpCode(200)
  @RequirePermission(QC_INSPECTION_VERIFY)
  @ApiOperation({
    summary: 'Verify a fixed defect',
    description: 'Not allowed for the user who marked it fixed.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'The defect' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires qc_inspection:verify',
  })
  @ApiResponse({
    status: 404,
    description: 'No such defect in the caller’s scope',
  })
  @ApiResponse({
    status: 409,
    description: 'The defect is not fixed, or the caller fixed it',
  })
  verify(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.defects.verify(id, user);
  }
}
