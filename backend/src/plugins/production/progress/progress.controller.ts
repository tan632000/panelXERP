import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
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

import { ProductionStage } from '@plugins/production/production-order/enums/production-stage.enum';
import {
  ProductionUnitFilterDto,
  StageUndoDto,
} from '@plugins/production/progress/dto/progress.dto';
import {
  PRODUCTION_PROGRESS_READ,
  PRODUCTION_PROGRESS_UNDO,
  PRODUCTION_PROGRESS_UPDATE,
} from '@plugins/production/progress/permissions/progress.permissions';
import { ProgressQueryService } from '@plugins/production/progress/services/progress-query.service';
import { ProgressService } from '@plugins/production/progress/services/progress.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

const stagePipe = new ParseEnumPipe(ProductionStage);

@ApiTags('production/progress')
@ApiBearerAuth()
@Controller('production/units')
export class ProgressController {
  constructor(
    private readonly service: ProgressService,
    private readonly queries: ProgressQueryService,
  ) {}

  @Get()
  @RequirePermission(PRODUCTION_PROGRESS_READ)
  @ApiOperation({
    summary: 'List cabinets with the progress of their six stages',
    description:
      'Filter by mine, production order or the status of the current stage. A technician sees only their own cabinets; a sales actor those of the orders they own.',
  })
  @ApiResponse({ status: 200, description: 'Paginated cabinets' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires production_progress:read',
  })
  findAll(
    @Query() query: ProductionUnitFilterDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.findAll(query, user);
  }

  @Get(':id')
  @RequirePermission(PRODUCTION_PROGRESS_READ)
  @ApiOperation({ summary: 'Get a cabinet with its six stages' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Cabinet' })
  @ApiResponse({
    status: 404,
    description: 'Not found, or outside the caller data scope',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.queries.findOne(id, user);
  }

  @Post(':id/stages/:stage/start')
  @HttpCode(200)
  @RequirePermission(PRODUCTION_PROGRESS_UPDATE)
  @ApiOperation({
    summary: 'Start a stage',
    description:
      'The previous stage must be done and the production order released. Only the assigned technician or a production manager.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'stage', enum: ProductionStage })
  @ApiResponse({ status: 200, description: 'Cabinet with its stages' })
  @ApiResponse({ status: 404, description: 'Cabinet not found or not yours' })
  @ApiResponse({
    status: 409,
    description:
      'Previous stage not done, stage not pending, or order not released',
  })
  startStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('stage', stagePipe) stage: ProductionStage,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.start(id, stage, user);
  }

  @Post(':id/stages/:stage/finish')
  @HttpCode(200)
  @RequirePermission(PRODUCTION_PROGRESS_UPDATE)
  @ApiOperation({
    summary: 'Finish a stage',
    description:
      'The last finishing completes the production order and tells the production managers and the sales owner.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'stage', enum: ProductionStage })
  @ApiResponse({ status: 200, description: 'Cabinet with its stages' })
  @ApiResponse({ status: 404, description: 'Cabinet not found or not yours' })
  @ApiResponse({
    status: 409,
    description: 'Stage not in progress, or order not released',
  })
  finishStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('stage', stagePipe) stage: ProductionStage,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.finish(id, stage, user);
  }

  @Post(':id/stages/:stage/undo')
  @HttpCode(200)
  @RequirePermission(PRODUCTION_PROGRESS_UNDO)
  @ApiOperation({
    summary: 'Take the latest finished stage back to in progress',
    description:
      'Production manager only, with a reason, while the production order is released and the next stage is still pending.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'stage', enum: ProductionStage })
  @ApiBody({ type: StageUndoDto })
  @ApiResponse({ status: 200, description: 'Cabinet with its stages' })
  @ApiResponse({
    status: 409,
    description:
      'Stage not done, next stage already started, or order not released',
  })
  undoStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('stage', stagePipe) stage: ProductionStage,
    @Body() dto: StageUndoDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.service.undo(id, stage, dto.reason, user);
  }
}
