import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import {
  PRODUCTION_MANAGER_ROLE,
  PRODUCTION_UNIT_OVERDUE_ASSIGNEE_EVENT,
  PRODUCTION_UNIT_OVERDUE_EVENT,
} from '@plugins/production/production-order/constants/production-order.constant';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import {
  ProductionStage,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';
import { PRODUCTION_ORDER_READ } from '@plugins/production/production-order/permissions/production-order.permissions';
import { overdueDedupeKey } from '@plugins/production/production-order/services/production-order-notifier.service';

import type { EntityManager } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

interface OverdueUnit {
  id: number;
  code: string;
  assignee_id: number | null;
  planned_end_date: string;
  order_id: number;
  production_order_id: number;
  production_order_code: string;
  order_code: string;
}

/** Released, not finished, planned before today. */
const CANDIDATES = `
  SELECT unit.id, unit.code, unit.assignee_id, unit.planned_end_date::text AS planned_end_date,
         header.order_id, header.id AS production_order_id,
         header.code AS production_order_code, header.order_code
    FROM production_units unit
    JOIN production_orders header ON header.id = unit.production_order_id
   WHERE unit.is_deleted = false AND header.is_deleted = false
     AND header.status = $1
     AND unit.planned_end_date < $2::date
     AND NOT EXISTS (SELECT 1 FROM production_unit_stages stage
                      WHERE stage.unit_id = unit.id AND stage.stage = $3 AND stage.status = $4)`;

/** The values of `$1`..`$4` of {@link CANDIDATES}, after `today` is put in `$2`. */
const candidateParams = (today: string) => [
  ProductionOrderStatus.RELEASED,
  today,
  ProductionStage.FINISHING,
  ProductionStageStatus.DONE,
];

function isUniqueViolation(error: unknown): boolean {
  const driver = (error as { driverError?: { code?: string } }).driverError;
  return driver?.code === UNIQUE_VIOLATION;
}

/** Tells the production managers and the assignee about every cabinet past its planned end date. */
@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * One pass for `today` (YYYY-MM-DD). The candidate list is read without a lock, so each
   * cabinet is decided again in a transaction of its own that holds the unit row `FOR SHARE`:
   * a finish, re-plan, reassignment or cancel either committed before the lock was granted and
   * is seen by the re-check, or queues behind it and clears the notice afterwards. Safe to run
   * again: an audience whose notice is open is skipped. Logs counts only.
   */
  async run(today: string): Promise<{ candidates: number; notified: number }> {
    const candidates: Array<{ id: number }> = await this.dataSource.query(
      `${CANDIDATES} ORDER BY unit.id`,
      candidateParams(today),
    );
    let notified = 0;
    let failed = 0;
    for (const { id } of candidates) {
      try {
        const emitted = await this.dataSource.transaction((manager) =>
          this.notify(manager, id, today),
        );
        if (emitted) notified += 1;
      } catch (error: unknown) {
        // Another run raised the same notice first: nothing is left to do for this cabinet.
        if (isUniqueViolation(error)) continue;
        failed += 1;
        this.logger.error(
          'Could not raise the overdue notice of a cabinet',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    this.logger.log(
      `Overdue check for ${today}: ${candidates.length} late, ${notified} notified, ${failed} failed`,
    );
    return { candidates: candidates.length, notified };
  }

  private async notify(
    manager: EntityManager,
    unitId: number,
    today: string,
  ): Promise<boolean> {
    // Only this row, and only shared: writers take header then unit `FOR UPDATE`, and this
    // transaction never asks for a header lock, so it can wait on a writer but never close a cycle.
    await manager.query(
      `SELECT id FROM production_units WHERE id = $1 AND is_deleted = false FOR SHARE`,
      [unitId],
    );
    const [unit]: OverdueUnit[] = await manager.query(
      `${CANDIDATES} AND unit.id = $5`,
      [...candidateParams(today), unitId],
    );
    if (!unit) return false;

    const dedupeKey = overdueDedupeKey(unit.id);
    const base = {
      dedupeKey,
      message: unit.code,
      requiredScope: PRODUCTION_ORDER_READ,
      link: `/production/orders/${unit.production_order_id}`,
      payload: {
        productionOrderId: unit.production_order_id,
        code: unit.production_order_code,
        orderId: unit.order_id,
        orderCode: unit.order_code,
        unitId: unit.id,
        unitCode: unit.code,
        plannedEndDate: unit.planned_end_date,
      },
    };
    let emitted = false;
    if (
      !(await this.notifications.findOpenByDedupeKey(
        PRODUCTION_UNIT_OVERDUE_EVENT,
        dedupeKey,
        manager,
      ))
    ) {
      // A record that names users is invisible to its role, so each audience has its own.
      await this.notifications.emit(
        {
          ...base,
          eventType: PRODUCTION_UNIT_OVERDUE_EVENT,
          roleCodes: [PRODUCTION_MANAGER_ROLE],
          userIds: [],
        },
        manager,
      );
      emitted = true;
    }
    if (
      unit.assignee_id !== null &&
      !(await this.notifications.findOpenByDedupeKey(
        PRODUCTION_UNIT_OVERDUE_ASSIGNEE_EVENT,
        dedupeKey,
        manager,
      ))
    ) {
      await this.notifications.emit(
        {
          ...base,
          eventType: PRODUCTION_UNIT_OVERDUE_ASSIGNEE_EVENT,
          roleCodes: [],
          userIds: [unit.assignee_id],
        },
        manager,
      );
      emitted = true;
    }
    return emitted;
  }
}
