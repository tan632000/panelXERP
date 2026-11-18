import { Injectable, Logger } from '@nestjs/common';

import { NotificationService } from '@kernel/core/audit/notification.service';

import {
  QC_ROUND_FAILED,
  QC_UNIT_FAILED_EVENT,
  QC_UNIT_PASSED_EVENT,
  STOREKEEPER_ROLE,
} from '@plugins/delivery/qc-inspection/constants/qc-inspection.constant';
import { QC_INSPECTION_READ } from '@plugins/delivery/qc-inspection/permissions/qc-inspection.permissions';
import { PRODUCTION_MANAGER_ROLE } from '@plugins/production/production-order/constants/production-order.constant';

import type { ProductionUnitView } from '@plugins/production/_shared/ports/production-unit.port';

/** What one committed round tells the people who act on it next. */
export interface RecordedRound {
  roundNo: number;
  result: string;
  defectCount: number;
  unit: ProductionUnitView;
}

/**
 * The notices of a QC round, sent after its transaction committed. A failed round tells the
 * production managers to fix, a passed one tells the storekeepers the cabinet may be shipped;
 * a failed notice is logged, never raised: the committed round stands.
 */
@Injectable()
export class QcNotifier {
  private readonly logger = new Logger(QcNotifier.name);

  constructor(private readonly notifications: NotificationService) {}

  async roundRecorded(round: RecordedRound, actorId: number): Promise<void> {
    const failed = round.result === QC_ROUND_FAILED;
    const eventType = failed ? QC_UNIT_FAILED_EVENT : QC_UNIT_PASSED_EVENT;
    try {
      await this.notifications.emit({
        eventType,
        roleCodes: [failed ? PRODUCTION_MANAGER_ROLE : STOREKEEPER_ROLE],
        message: round.unit.code,
        requiredScope: QC_INSPECTION_READ,
        link: `/delivery/qc/units/${round.unit.unitId}`,
        payload: {
          unitId: round.unit.unitId,
          unitCode: round.unit.code,
          tag: round.unit.tag,
          productionOrderId: round.unit.productionOrderId,
          productionOrderCode: round.unit.productionOrderCode,
          orderId: round.unit.orderId,
          roundNo: round.roundNo,
          defectCount: round.defectCount,
        },
        createdBy: actorId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not send the ${eventType} notice of cabinet ${round.unit.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
