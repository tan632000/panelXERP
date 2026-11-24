import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { GatewayModule as CatalogGatewayModule } from '@plugins/catalog/_shared/gateways/gateway.module';
import { ReferenceCheckRegistry } from '@plugins/catalog/_shared/gateways/reference-check-registry';
import {
  ITEM_IN_LIVE_TEMPLATE_SQL,
  QUOTATION_TEMPLATE_ITEM_REFERENCE_CHECK,
} from '@plugins/sales/template/constants/quotation-template.constant';
import { QuotationTemplateLine } from '@plugins/sales/template/entities/quotation-template-line.entity';
import { QuotationTemplatePanel } from '@plugins/sales/template/entities/quotation-template-panel.entity';
import { QuotationTemplate } from '@plugins/sales/template/entities/quotation-template.entity';
import { QuotationTemplateService } from '@plugins/sales/template/services/quotation-template.service';
import { TemplateController } from '@plugins/sales/template/template.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuotationTemplate,
      QuotationTemplatePanel,
      QuotationTemplateLine,
    ]),
    CatalogGatewayModule,
  ],
  controllers: [TemplateController],
  providers: [QuotationTemplateService],
})
export class TemplateModule implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly referenceChecks: ReferenceCheckRegistry,
  ) {}

  /** An item that a live template's lines name cannot be deleted: the lines keep pointing at it. */
  onModuleInit(): void {
    this.referenceChecks.registerItemCheck(
      QUOTATION_TEMPLATE_ITEM_REFERENCE_CHECK,
      async (itemId) => {
        const rows: unknown[] = await this.dataSource.query(
          ITEM_IN_LIVE_TEMPLATE_SQL,
          [itemId],
        );
        return rows.length > 0;
      },
    );
  }
}
