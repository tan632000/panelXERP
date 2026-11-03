import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  PRODUCTION_LIFECYCLE_HOOK,
  PRODUCTION_ORDER_CODE_INDEX,
  PRODUCTION_ORDER_CODE_PREFIX,
  PRODUCTION_ORDER_LABEL,
  PRODUCTION_ORDER_TABLE,
  PRODUCTION_TECHNICIAN_ROLE,
} from '@plugins/production/production-order/constants/production-order.constant';
import { CreateProductionOrderDto } from '@plugins/production/production-order/dto/production-order.dto';
import { ProductionOrderEvent } from '@plugins/production/production-order/entities/production-order-event.entity';
import { ProductionOrder } from '@plugins/production/production-order/entities/production-order.entity';
import { ProductionUnit } from '@plugins/production/production-order/entities/production-unit.entity';
import { ProductionOrderEventType } from '@plugins/production/production-order/enums/production-order-event.enum';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import {
  PRODUCTION_STAGES,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';
import { ProductionOrderQueryService } from '@plugins/production/production-order/services/production-order-query.service';
import { OrderLifecycleRegistry } from '@plugins/sales/_shared/ports/order-lifecycle-registry';
import {
  OrderProductionPort,
  type ProductionOrderLine,
} from '@plugins/sales/_shared/ports/order-production.port';
import { SalesUserLookup } from '@plugins/sales/_shared/services/sales-user-lookup.service';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { EntityManager } from 'typeorm';

/** The sales order an order status check reads. */
const OPEN_ORDER = 'open';

/**
 * Creates a production order from an open order, and keeps a sales order that has one from
 * being cancelled. The create takes the order row `FOR UPDATE` first (global lock order: order
 * → production order → units), so it is serialised with an order cancel and with every other
 * production write that moves the order.
 */
@Injectable()
export class ProductionOrderService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orders: OrderProductionPort,
    private readonly lifecycle: OrderLifecycleRegistry,
    private readonly queries: ProductionOrderQueryService,
    private readonly users: SalesUserLookup,
  ) {}

  /**
   * An order is cancelled only after its production order. The veto runs inside the cancel
   * transaction, after the order row is locked, so a production order committed before it is
   * always seen, and one created after it waits for the cancel.
   */
  onModuleInit(): void {
    this.lifecycle.register(PRODUCTION_LIFECYCLE_HOOK, {
      onCancelled: async (manager, { orderId }) => {
        const live = await this.liveProductionOrder(manager, orderId);
        if (live) {
          throw new ConflictException(
            `Order ${orderId} has ${PRODUCTION_ORDER_LABEL.toLowerCase()} ${live} and cannot be cancelled: cancel the production order first.`,
          );
        }
        return { changedOrderIds: [], touchedItemIds: [] };
      },
    });
  }

  async create(dto: CreateProductionOrderDto, actor: AuthUserPayload) {
    const id = await createWithDocumentCode(
      this.dataSource,
      {
        table: PRODUCTION_ORDER_TABLE,
        prefix: PRODUCTION_ORDER_CODE_PREFIX,
        codeUniqueIndex: PRODUCTION_ORDER_CODE_INDEX,
        exhaustedMessage:
          'Could not allocate a production order code, please try again.',
      },
      async (manager, code) => {
        const order = await this.orders.lockForProduction(manager, dto.orderId);
        if (!order) throw new NotFoundException('Order not found');
        if (order.status !== OPEN_ORDER) {
          throw new ConflictException(
            `Order ${order.code} is ${order.status}; only an open order can go to production.`,
          );
        }
        const live = await this.liveProductionOrder(manager, order.id);
        if (live) {
          throw new ConflictException(
            `Order ${order.code} already has production order ${live}.`,
          );
        }
        if (order.lines.length === 0) {
          throw new ConflictException(`Order ${order.code} has no panels.`);
        }

        const header = await manager.getRepository(ProductionOrder).save(
          manager.getRepository(ProductionOrder).create({
            code,
            orderId: order.id,
            orderCode: order.code,
            status: ProductionOrderStatus.DRAFT,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          }),
        );
        await this.createUnits(manager, header.id, order.lines, actor.userId);
        await manager.getRepository(ProductionOrderEvent).insert({
          productionOrderId: header.id,
          event: ProductionOrderEventType.CREATED,
          actorId: actor.userId,
        });
        return header.id;
      },
    );
    return this.queries.findOne(id, actor);
  }

  /** The accounts a cabinet may be assigned to. */
  async listTechnicianOptions(): Promise<Array<{ id: number; name: string }>> {
    const technicians = await this.users.listActiveWithRoles([
      PRODUCTION_TECHNICIAN_ROLE,
    ]);
    return technicians.map(({ id, fullName }) => ({ id, name: fullName }));
  }

  /** Code of the order's non-cancelled production order, or null. */
  private async liveProductionOrder(
    manager: EntityManager,
    orderId: number,
  ): Promise<string | null> {
    const [row]: Array<{ code: string }> = await manager.query(
      `SELECT code FROM ${PRODUCTION_ORDER_TABLE}
        WHERE order_id = $1 AND status <> 'cancelled' AND is_deleted = false
        LIMIT 1`,
      [orderId],
    );
    return row?.code ?? null;
  }

  /**
   * One unit per physical cabinet, coded `<tag>-<n>`, and the six `pending` stage rows of
   * each. Numbering runs per tag across the order, so two lines with one tag stay unique.
   */
  private async createUnits(
    manager: EntityManager,
    productionOrderId: number,
    lines: readonly ProductionOrderLine[],
    actorId: number,
  ): Promise<void> {
    const counters = new Map<string, number>();
    const units: Array<Partial<ProductionUnit>> = [];
    for (const line of lines) {
      for (let n = 0; n < line.quantity; n++) {
        const next = (counters.get(line.tag) ?? 0) + 1;
        counters.set(line.tag, next);
        units.push({
          productionOrderId,
          orderLineId: line.id,
          code: `${line.tag}-${next}`,
          tag: line.tag,
          description: line.description,
          createdBy: actorId,
          updatedBy: actorId,
        });
      }
    }
    const inserted = await manager.getRepository(ProductionUnit).insert(units);
    await manager.query(
      `INSERT INTO production_unit_stages (unit_id, stage, seq, status)
       SELECT u.id, s.stage::production_stage, s.seq, $3::production_stage_status
         FROM unnest($1::int[]) AS u(id)
        CROSS JOIN unnest($2::text[], $4::int[]) AS s(stage, seq)`,
      [
        inserted.identifiers.map((identifier) => Number(identifier.id)),
        [...PRODUCTION_STAGES],
        ProductionStageStatus.PENDING,
        PRODUCTION_STAGES.map((_, index) => index + 1),
      ],
    );
  }
}
