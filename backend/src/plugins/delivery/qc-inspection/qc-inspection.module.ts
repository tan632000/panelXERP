import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { QC_GUARD_NAME } from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';
import { QcDefect } from '@plugins/delivery/qc-inspection/entities/qc-defect.entity';
import { QcRoundItem } from '@plugins/delivery/qc-inspection/entities/qc-round-item.entity';
import { QcRound } from '@plugins/delivery/qc-inspection/entities/qc-round.entity';
import { QcInspectionController } from '@plugins/delivery/qc-inspection/qc-inspection.controller';
import { QcDefectService } from '@plugins/delivery/qc-inspection/services/qc-defect.service';
import { qcGuards } from '@plugins/delivery/qc-inspection/services/qc-guards';
import { QcInspectionService } from '@plugins/delivery/qc-inspection/services/qc-inspection.service';
import { QcNotifier } from '@plugins/delivery/qc-inspection/services/qc-notifier.service';
import { ProductionGuardRegistry } from '@plugins/production/_shared/ports/production-guard.registry';
import { ProductionSharedModule } from '@plugins/production/_shared/production-shared.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QcRound, QcRoundItem, QcDefect]),
    AuditModule,
    SalesSharedModule,
    ProductionSharedModule,
  ],
  controllers: [QcInspectionController],
  providers: [QcInspectionService, QcDefectService, QcNotifier],
})
export class QcInspectionModule implements OnModuleInit {
  constructor(private readonly guards: ProductionGuardRegistry) {}

  /** From now on production asks QC before it undoes a finishing stage or cancels an order. */
  onModuleInit(): void {
    this.guards.register(QC_GUARD_NAME, qcGuards);
  }
}
