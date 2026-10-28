import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';

import { requireText } from '@plugins/inventory/_shared/utils/text.util';
import {
  PURCHASE_ORDER_APPROVED_EVENT,
  PURCHASE_ORDER_APPROVER_ROLE_CODES,
  PURCHASE_ORDER_LABEL,
  PURCHASE_ORDER_REJECTED_EVENT,
  PURCHASE_ORDER_SUBMITTED_EVENT,
} from '@plugins/inventory/purchase-order/constants/purchase-order.constant';
import { PurchaseOrderReasonDto } from '@plugins/inventory/purchase-order/dto/purchase-order.dto';
import { PurchaseOrderEventType } from '@plugins/inventory/purchase-order/enums/purchase-order-event.enum';
import {
  PURCHASE_ORDER_CANCELLABLE,
  PURCHASE_ORDER_CLOSABLE,
  PurchaseOrderStatus,
} from '@plugins/inventory/purchase-order/enums/purchase-order-status.enum';
import {
  PURCHASE_ORDER_APPROVE,
  PURCHASE_ORDER_READ,
} from '@plugins/inventory/purchase-order/permissions/purchase-order.permissions';
import { PurchaseOrderService } from '@plugins/inventory/purchase-order/services/purchase-order.service';
import {
  assertPurchaseOrderStatus,
  lockPurchaseOrder,
  movePurchaseOrder,
  recordPurchaseOrderEvent,
} from '@plugins/inventory/purchase-order/utils/purchase-order-lock.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { PurchaseOrder } from '@plugins/inventory/purchase-order/entities/purchase-order.entity';
import type { EntityManager } from 'typeorm';

/**
 * The order's decisions. Each runs in one transaction that takes the header `FOR UPDATE` and
 * moves it with `UPDATE … WHERE status = :expected`, so two decisions on one order never both
 * act on the status they read (an approve racing a cancel: one wins, the other gets 409).
 * Notices go out after the commit; a failed notice never undoes a decision.
 */
@Injectable()
export class PurchaseOrderApprovalService {
  private readonly logger = new Logger(PurchaseOrderApprovalService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: PurchaseOrderService,
    private readonly notifications: NotificationService,
  ) {}

  /** Hands a draft with at least one line to the directors. */
  async submit(id: number, actor: AuthUserPayload) {
    const order = await this.dataSource.transaction(async (manager) => {
      const held = await lockPurchaseOrder(manager, id);
      assertPurchaseOrderStatus(held, [PurchaseOrderStatus.DRAFT], 'submitted');
      const [{ count }]: Array<{ count: string }> = await manager.query(
        `SELECT COUNT(*) AS count FROM purchase_order_lines WHERE purchase_order_id = $1`,
        [id],
      );
      if (Number(count) === 0) {
        throw new ConflictException(
          `${PURCHASE_ORDER_LABEL} ${held.code} has no lines to submit.`,
        );
      }
      await movePurchaseOrder(
        manager,
        held,
        PurchaseOrderStatus.PENDING_APPROVAL,
        {
          submittedBy: actor.userId,
          submittedAt: new Date(),
          updatedBy: actor.userId,
        },
      );
      await recordPurchaseOrderEvent(
        manager,
        id,
        PurchaseOrderEventType.SUBMITTED,
        actor.userId,
      );
      return held;
    });

    await this.notify(PURCHASE_ORDER_SUBMITTED_EVENT, order, actor, {
      roleCodes: [...PURCHASE_ORDER_APPROVER_ROLE_CODES],
      excludeUserIds: [actor.userId],
      requiredScope: PURCHASE_ORDER_APPROVE,
    });
    return this.orders.findOne(id, actor);
  }

  async approve(id: number, actor: AuthUserPayload) {
    const order = await this.dataSource.transaction(async (manager) => {
      const held = await lockPurchaseOrder(manager, id);
      await this.assertUninvolved(manager, held, actor);
      assertPurchaseOrderStatus(
        held,
        [PurchaseOrderStatus.PENDING_APPROVAL],
        'approved',
      );
      await movePurchaseOrder(manager, held, PurchaseOrderStatus.APPROVED, {
        approvedBy: actor.userId,
        approvedAt: new Date(),
        updatedBy: actor.userId,
      });
      await recordPurchaseOrderEvent(
        manager,
        id,
        PurchaseOrderEventType.APPROVED,
        actor.userId,
      );
      return held;
    });

    await this.notifyCreator(PURCHASE_ORDER_APPROVED_EVENT, order, actor);
    return this.orders.findOne(id, actor);
  }

  /** Sends the order back to draft; the reason stays in its history for purchasing to act on. */
  async reject(
    id: number,
    dto: PurchaseOrderReasonDto,
    actor: AuthUserPayload,
  ) {
    const reason = requireText(dto.reason, 'Reason is required.');
    const order = await this.dataSource.transaction(async (manager) => {
      const held = await lockPurchaseOrder(manager, id);
      await this.assertUninvolved(manager, held, actor);
      assertPurchaseOrderStatus(
        held,
        [PurchaseOrderStatus.PENDING_APPROVAL],
        'rejected',
      );
      await movePurchaseOrder(manager, held, PurchaseOrderStatus.DRAFT, {
        submittedBy: null,
        submittedAt: null,
        updatedBy: actor.userId,
      });
      await recordPurchaseOrderEvent(
        manager,
        id,
        PurchaseOrderEventType.REJECTED,
        actor.userId,
        reason,
      );
      return held;
    });

    await this.notifyCreator(PURCHASE_ORDER_REJECTED_EVENT, order, actor, {
      reason,
    });
    return this.orders.findOne(id, actor);
  }

  /** Ends an order nothing has been received on. */
  async cancel(
    id: number,
    dto: PurchaseOrderReasonDto,
    actor: AuthUserPayload,
  ) {
    const reason = requireText(dto.reason, 'Reason is required.');
    await this.dataSource.transaction(async (manager) => {
      const held = await lockPurchaseOrder(manager, id);
      assertPurchaseOrderStatus(held, PURCHASE_ORDER_CANCELLABLE, 'cancelled');
      // Receipts write `received_qty` under this same header lock, so the sum is current.
      const [{ received }]: Array<{ received: boolean }> = await manager.query(
        `SELECT COALESCE(SUM(received_qty), 0) > 0 AS received
           FROM purchase_order_lines WHERE purchase_order_id = $1`,
        [id],
      );
      if (received) {
        throw new ConflictException(
          `${PURCHASE_ORDER_LABEL} ${held.code} has goods received; close it instead.`,
        );
      }
      await movePurchaseOrder(manager, held, PurchaseOrderStatus.CANCELLED, {
        cancelReason: reason,
        cancelledBy: actor.userId,
        cancelledAt: new Date(),
        updatedBy: actor.userId,
      });
      await recordPurchaseOrderEvent(
        manager,
        id,
        PurchaseOrderEventType.CANCELLED,
        actor.userId,
        reason,
      );
    });
    return this.orders.findOne(id, actor);
  }

  /** Short-closes an order whose remaining goods will not come. */
  async close(id: number, dto: PurchaseOrderReasonDto, actor: AuthUserPayload) {
    const reason = requireText(dto.reason, 'Reason is required.');
    await this.dataSource.transaction(async (manager) => {
      const held = await lockPurchaseOrder(manager, id);
      assertPurchaseOrderStatus(held, PURCHASE_ORDER_CLOSABLE, 'closed');
      await movePurchaseOrder(manager, held, PurchaseOrderStatus.CLOSED, {
        closeReason: reason,
        closedBy: actor.userId,
        closedAt: new Date(),
        updatedBy: actor.userId,
      });
      await recordPurchaseOrderEvent(
        manager,
        id,
        PurchaseOrderEventType.CLOSED,
        actor.userId,
        reason,
      );
    });
    return this.orders.findOne(id, actor);
  }

  /**
   * Four eyes: whoever created, edited or ever submitted the order cannot decide on it. A
   * rejection clears `submitted_by`, so earlier submitters come from the history: resubmitting
   * unchanged content must not let its first submitter approve it.
   */
  private async assertUninvolved(
    manager: EntityManager,
    order: PurchaseOrder,
    actor: AuthUserPayload,
  ): Promise<void> {
    const submitters: Array<{ actor_id: number }> = await manager.query(
      `SELECT DISTINCT actor_id FROM purchase_order_events
        WHERE purchase_order_id = $1 AND event = $2`,
      [order.id, PurchaseOrderEventType.SUBMITTED],
    );
    const involved = new Set<number>([
      ...(order.editorIds ?? []),
      ...submitters.map((row) => Number(row.actor_id)),
      ...[order.createdBy, order.submittedBy].filter(
        (id): id is number => typeof id === 'number',
      ),
    ]);
    if (involved.has(actor.userId)) {
      throw new ForbiddenException(
        'The creator, the submitter or an editor of a purchase order cannot approve or reject it.',
      );
    }
  }

  private notifyCreator(
    eventType: string,
    order: PurchaseOrder,
    actor: AuthUserPayload,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    if (typeof order.createdBy !== 'number') return Promise.resolve();
    return this.notify(eventType, order, actor, {
      userIds: [order.createdBy],
      requiredScope: PURCHASE_ORDER_READ,
      extra,
    });
  }

  private async notify(
    eventType: string,
    order: PurchaseOrder,
    actor: AuthUserPayload,
    target: {
      roleCodes?: string[];
      userIds?: number[];
      excludeUserIds?: number[];
      requiredScope: string;
      extra?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.notifications.emit({
        eventType,
        roleCodes: target.roleCodes ?? [],
        userIds: target.userIds,
        excludeUserIds: target.excludeUserIds,
        // The bell phrases the event from the payload; the text is the fallback.
        message: order.code,
        requiredScope: target.requiredScope,
        link: `/inventory/purchase-orders/${order.id}`,
        payload: {
          purchaseOrderId: order.id,
          code: order.code,
          ...target.extra,
        },
        createdBy: actor.userId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not send the ${eventType} notice of purchase order ${order.code}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
