import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import {
  CurrentUser,
  RequirePermission,
} from '@kernel/core/auth/decorators/auth.decorators';

import {
  ESTIMATE_AI_TRIGGER_LIMIT,
  ESTIMATE_AI_TRIGGER_TTL_MS,
} from '@plugins/sales/estimate/constants/estimate-ai.constant';
import { AiPrefillDto } from '@plugins/sales/estimate/dto/ai-prefill.dto';
import { ESTIMATE_AI_PREFILL } from '@plugins/sales/estimate/permissions/estimate.permissions';
import { EstimateAiPrefillService } from '@plugins/sales/estimate/services/estimate-ai-prefill.service';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('sales/estimates')
@ApiBearerAuth()
@Controller('sales/estimates/ai-prefill')
export class EstimateAiController {
  constructor(private readonly prefill: EstimateAiPrefillService) {}

  @Post()
  @HttpCode(202)
  @RequirePermission(ESTIMATE_AI_PREFILL)
  @Throttle({
    default: {
      ttl: ESTIMATE_AI_TRIGGER_TTL_MS,
      limit: ESTIMATE_AI_TRIGGER_LIMIT,
    },
  })
  @ApiOperation({
    summary: 'Fill an estimate draft from a request with AI',
    description:
      'Queues a background run that reads the request, its attachments and its project template and writes an AI draft estimate. Only Sales, a sales manager or the director may start one.',
  })
  @ApiBody({ type: AiPrefillDto })
  @ApiResponse({ status: 202, description: 'Run queued: `{ runId }`' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: needs estimate:ai_prefill and a sales role',
  })
  @ApiResponse({
    status: 404,
    description: 'Request not found or out of scope',
  })
  @ApiResponse({
    status: 409,
    description:
      'Request not eligible, a run already active, or the catalog is too large',
  })
  @ApiResponse({ status: 429, description: 'Daily run limit reached' })
  @ApiResponse({ status: 503, description: 'AI is not configured' })
  trigger(@Body() dto: AiPrefillDto, @CurrentUser() user: AuthUserPayload) {
    return this.prefill.trigger(dto, user);
  }

  @Get(':runId')
  @RequirePermission(ESTIMATE_AI_PREFILL)
  @ApiOperation({
    summary: 'Get the state of an AI run',
    description:
      'Status, the typed error of a failed run, the estimate it made and its summary.',
  })
  @ApiParam({ name: 'runId', type: Number })
  @ApiResponse({ status: 200, description: 'Run state' })
  @ApiResponse({ status: 404, description: 'Run not found or out of scope' })
  getRun(
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.prefill.getRun(runId, user);
  }
}
