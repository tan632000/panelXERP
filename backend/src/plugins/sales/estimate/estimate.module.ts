import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { GatewayModule as CatalogGatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { GatewayModule as CrmGatewayModule } from '@plugins/crm/_shared/gateways/gateway.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';
import { AnthropicAiClient } from '@plugins/sales/estimate/ai/anthropic-ai.client';
import { OpenAiAiClient } from '@plugins/sales/estimate/ai/openai-ai.client';
import {
  ESTIMATE_AI_CLIENT,
  ESTIMATE_AI_QUEUE,
  ESTIMATE_AI_QUEUE_SETTINGS,
  ESTIMATE_AI_SETTINGS,
} from '@plugins/sales/estimate/constants/estimate-ai.constant';
import { EstimateAiRun } from '@plugins/sales/estimate/entities/estimate-ai-run.entity';
import { EstimateBomLine } from '@plugins/sales/estimate/entities/estimate-bom-line.entity';
import { EstimateCostLine } from '@plugins/sales/estimate/entities/estimate-cost-line.entity';
import { EstimatePanel } from '@plugins/sales/estimate/entities/estimate-panel.entity';
import { EstimateRevision } from '@plugins/sales/estimate/entities/estimate-revision.entity';
import { Estimate } from '@plugins/sales/estimate/entities/estimate.entity';
import { EstimateAiPrefillProcessor } from '@plugins/sales/estimate/estimate-ai-prefill.processor';
import { EstimateAiController } from '@plugins/sales/estimate/estimate-ai.controller';
import { EstimateController } from '@plugins/sales/estimate/estimate.controller';
import { EstimateAiPrefillService } from '@plugins/sales/estimate/services/estimate-ai-prefill.service';
import { EstimateAiSweeperService } from '@plugins/sales/estimate/services/estimate-ai-sweeper.service';
import { EstimateAiWriterService } from '@plugins/sales/estimate/services/estimate-ai-writer.service';
import { EstimateEditService } from '@plugins/sales/estimate/services/estimate-edit.service';
import { EstimatePricingService } from '@plugins/sales/estimate/services/estimate-pricing.service';
import { EstimateVerifyService } from '@plugins/sales/estimate/services/estimate-verify.service';
import { EstimateService } from '@plugins/sales/estimate/services/estimate.service';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AiSettings } from '@kernel/core/config/ai-provider.config';
import type { AiClient } from '@plugins/sales/estimate/ai/ai-client.port';

/** Anything but `openai` gets the Anthropic client, which refuses to run without its key. */
export function createAiClient(settings: AiSettings): AiClient {
  return settings.provider === 'openai'
    ? new OpenAiAiClient(settings)
    : new AnthropicAiClient(settings);
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Estimate,
      EstimateAiRun,
      EstimateRevision,
      EstimatePanel,
      EstimateBomLine,
      EstimateCostLine,
      SalesRequest,
    ]),
    BullModule.registerQueue({
      name: ESTIMATE_AI_QUEUE,
      settings: ESTIMATE_AI_QUEUE_SETTINGS,
    }),
    AuditModule,
    CatalogGatewayModule,
    CrmGatewayModule,
    SalesSharedModule,
  ],
  controllers: [EstimateController, EstimateAiController],
  providers: [
    EstimateService,
    EstimateEditService,
    EstimatePricingService,
    EstimateVerifyService,
    EstimateAiPrefillService,
    EstimateAiWriterService,
    EstimateAiSweeperService,
    EstimateAiPrefillProcessor,
    {
      provide: ESTIMATE_AI_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiSettings => ({
        provider: config.getOrThrow<string>('ai.provider'),
        apiKey: config.get<string | undefined>('ai.apiKey'),
        model: config.getOrThrow<string>('ai.model'),
      }),
    },
    {
      provide: ESTIMATE_AI_CLIENT,
      inject: [ESTIMATE_AI_SETTINGS],
      useFactory: createAiClient,
    },
  ],
  exports: [EstimateService],
})
export class EstimateModule {}
