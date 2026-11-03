import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  NotificationService,
  type EmitNotificationInput,
} from '@kernel/core/audit/notification.service';

import { PRODUCTION_ISSUE_READ } from '@plugins/production/production-issue/permissions/production-issue.permissions';
import {
  PRODUCTION_ISSUE_OPENED_EVENT,
  PRODUCTION_ISSUE_RESOLVED_EVENT,
  PRODUCTION_MANAGER_ROLE,
  PRODUCTION_ORDER_CANCELLED_EVENT,
  PRODUCTION_ORDER_CANCELLED_OWNER_EVENT,
  PRODUCTION_ORDER_COMPLETED_EVENT,
  PRODUCTION_ORDER_COMPLETED_OWNER_EVENT,
  PRODUCTION_ORDER_RELEASED_EVENT,
  PRODUCTION_ORDER_RELEASED_OWNER_EVENT,
  PRODUCTION_UNIT_ASSIGNED_EVENT,
  PRODUCTION_UNIT_OVERDUE_ASSIGNEE_EVENT,
  PRODUCTION_UNIT_OVERDUE_EVENT,
} from '@plugins/production/production-order/constants/production-order.constant';
import { PRODUCTION_ORDER_READ } from '@plugins/production/production-order/permissions/production-order.permissions';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { ProductionOrder } from '@plugins/production/production-order/entities/production-order.entity';
import type { EntityManager } from 'typeorm';

/** The subject of a cabinet's overdue notices. */
export const overdueDedupeKey = (unitId: number) => `unit:${unitId}`;

/** What an issue notice says about the issue. */
export interface IssueNotice {
  id: number;
  unitId: number;
  unitCode: string;
  stage: string;
  severity: string;
}

const issuePayload = (issue: IssueNotice) => ({
  issueId: issue.id,
  unitId: issue.unitId,
  unitCode: issue.unitCode,
  stage: issue.stage,
  severity: issue.severity,
});

/**
 * The notices of a production order, sent after its transaction committed. One record per
 * audience (a record naming users is invisible to their role), and a failed notice is logged,
 * never raised: the committed change stands.
 */
@Injectable()
export class ProductionOrderNotifier {
  private readonly logger = new Logger(ProductionOrderNotifier.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataSource: DataSource,
  ) {}

  /** Technicians with cabinets in it, and the sales owner of the order. */
  released(
    order: ProductionOrder,
    assigneeIds: readonly number[],
    actorId: number,
  ): Promise<void> {
    return this.toAssigneesAndOwner(
      order,
      assigneeIds,
      actorId,
      PRODUCTION_ORDER_RELEASED_EVENT,
      PRODUCTION_ORDER_RELEASED_OWNER_EVENT,
    );
  }

  cancelled(
    order: ProductionOrder,
    assigneeIds: readonly number[],
    actorId: number,
    reason: string,
  ): Promise<void> {
    return this.toAssigneesAndOwner(
      order,
      assigneeIds,
      actorId,
      PRODUCTION_ORDER_CANCELLED_EVENT,
      PRODUCTION_ORDER_CANCELLED_OWNER_EVENT,
      { reason },
    );
  }

  /** Every cabinet is finished: the production managers (by role) and the sales owner. */
  async completed(order: ProductionOrder, actorId: number): Promise<void> {
    await this.send(PRODUCTION_ORDER_COMPLETED_EVENT, order, actorId, {
      roleCodes: [PRODUCTION_MANAGER_ROLE],
      dedupeKey: `production-order:${order.id}`,
    });
    await this.toOwner(
      order,
      actorId,
      PRODUCTION_ORDER_COMPLETED_OWNER_EVENT,
      {},
    );
  }

  /** The technician a released order's cabinet was handed to. */
  assigned(
    order: ProductionOrder,
    unit: { id: number; code: string },
    assigneeId: number,
    actorId: number,
  ): Promise<void> {
    return this.send(PRODUCTION_UNIT_ASSIGNED_EVENT, order, actorId, {
      userIds: [assigneeId],
      payload: { unitId: unit.id, unitCode: unit.code },
    });
  }

  /** A problem reported on a cabinet: the production managers, by role. */
  issueOpened(
    order: ProductionOrder,
    issue: IssueNotice,
    actorId: number,
  ): Promise<void> {
    return this.send(PRODUCTION_ISSUE_OPENED_EVENT, order, actorId, {
      roleCodes: [PRODUCTION_MANAGER_ROLE],
      dedupeKey: `production-issue:${issue.id}`,
      payload: issuePayload(issue),
      requiredScope: PRODUCTION_ISSUE_READ,
      link: '/production/issues',
    });
  }

  /** The issue was closed: the technician who reported it. */
  issueResolved(
    order: ProductionOrder,
    issue: IssueNotice,
    reporterId: number,
    actorId: number,
  ): Promise<void> {
    return this.send(PRODUCTION_ISSUE_RESOLVED_EVENT, order, actorId, {
      userIds: [reporterId],
      dedupeKey: `production-issue:${issue.id}`,
      payload: issuePayload(issue),
      requiredScope: PRODUCTION_ISSUE_READ,
      link: '/production/issues',
    });
  }

  /**
   * Clears the overdue notices of cabinets, inside the transaction that changed the cabinet so
   * a notice can never outlive the state it reports. A reassignment clears only the old
   * assignee's notice; the production managers' one stays until the cabinet is no longer late.
   */
  async clearOverdue(
    manager: EntityManager,
    unitIds: readonly number[],
    scope: 'all' | 'assignee' = 'all',
  ): Promise<void> {
    const eventTypes =
      scope === 'all'
        ? [
            PRODUCTION_UNIT_OVERDUE_EVENT,
            PRODUCTION_UNIT_OVERDUE_ASSIGNEE_EVENT,
          ]
        : [PRODUCTION_UNIT_OVERDUE_ASSIGNEE_EVENT];
    for (const unitId of unitIds) {
      for (const eventType of eventTypes) {
        await this.notifications.close(
          { eventType, dedupeKey: overdueDedupeKey(unitId) },
          manager,
        );
      }
    }
  }

  private async toAssigneesAndOwner(
    order: ProductionOrder,
    assigneeIds: readonly number[],
    actorId: number,
    assigneeEvent: string,
    ownerEvent: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const assignees = [...new Set(assigneeIds)];
    if (assignees.length > 0) {
      await this.send(assigneeEvent, order, actorId, {
        userIds: assignees,
        payload,
        dedupeKey: `production-order:${order.id}`,
      });
    }
    await this.toOwner(order, actorId, ownerEvent, payload);
  }

  private async toOwner(
    order: ProductionOrder,
    actorId: number,
    ownerEvent: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const header = await this.orders.getOrder(
        this.dataSource.manager,
        order.orderId,
      );
      if (header) {
        await this.send(ownerEvent, order, actorId, {
          userIds: [header.salesOwnerId],
          payload: { ...payload, customerName: header.customerName },
          dedupeKey: `production-order:${order.id}`,
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        `Could not find the owner to tell about ${ownerEvent} of ${order.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async send(
    eventType: string,
    order: ProductionOrder,
    actorId: number,
    target: Pick<EmitNotificationInput, 'userIds' | 'dedupeKey'> & {
      roleCodes?: string[];
      payload?: Record<string, unknown>;
      /** Defaults to reading production orders, with the order page as the link. */
      requiredScope?: string;
      link?: string;
    },
  ): Promise<void> {
    try {
      await this.notifications.emit({
        eventType,
        roleCodes: target.roleCodes ?? [],
        userIds: target.userIds,
        dedupeKey: target.dedupeKey,
        // The bell phrases the event from the payload; the text is the fallback.
        message: order.code,
        requiredScope: target.requiredScope ?? PRODUCTION_ORDER_READ,
        link: target.link ?? `/production/orders/${order.id}`,
        payload: {
          productionOrderId: order.id,
          code: order.code,
          orderId: order.orderId,
          orderCode: order.orderCode,
          ...target.payload,
        },
        createdBy: actorId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not send the ${eventType} notice of production order ${order.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
