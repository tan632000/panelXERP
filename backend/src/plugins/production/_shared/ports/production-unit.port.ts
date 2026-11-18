import { Injectable, NotFoundException } from '@nestjs/common';

import { ProductionUnit } from '@plugins/production/production-order/entities/production-unit.entity';
import { ProductionOrderStatus } from '@plugins/production/production-order/enums/production-order-status.enum';
import {
  ProductionStage,
  ProductionStageStatus,
} from '@plugins/production/production-order/enums/production-stage.enum';
import { lockProductionOrder } from '@plugins/production/production-order/utils/production-order-lock.util';

import type { ScopeCondition } from '@plugins/production/production-order/utils/production-scope.util';
import type { EntityManager } from 'typeorm';

/** One physical cabinet with the production order it belongs to. */
export interface ProductionUnitView {
  unitId: number;
  code: string;
  tag: string;
  description: string | null;
  productionOrderId: number;
  productionOrderCode: string;
  productionOrderStatus: ProductionOrderStatus;
  orderId: number;
  finishingDone: boolean;
}

export interface ListUnitsFilter {
  /**
   * The sales orders the caller may see, as SQL on the given order column (`po.order_id`). Its
   * parameters are numbered from `$1`: the port binds them first.
   */
  orderScope: (column: string) => ScopeCondition;
  orderId?: number;
  unitId?: number;
  finishingDone?: boolean;
}

const FINISHING_DONE = `EXISTS (SELECT 1 FROM production_unit_stages s
                                WHERE s.unit_id = u.id AND s.stage = '${ProductionStage.FINISHING}'
                                  AND s.status = '${ProductionStageStatus.DONE}')`;

const SELECT_UNIT = `SELECT u.id AS "unitId", u.code, u.tag, u.description,
                            po.id AS "productionOrderId", po.code AS "productionOrderCode",
                            po.status AS "productionOrderStatus", po.order_id AS "orderId",
                            ${FINISHING_DONE} AS "finishingDone"
                       FROM production_units u
                       JOIN production_orders po ON po.id = u.production_order_id`;

/**
 * What the features that follow a finished cabinet (QC, delivery) may do with production's
 * cabinets: lock them in production's own order (header, then units by ascending id) and list
 * them. It only reads; the stages stay production's to change.
 */
@Injectable()
export class ProductionUnitPort {
  /**
   * The header of the cabinet's production order `FOR UPDATE`, then the cabinet row. A cabinet
   * of a cancelled production order is still returned, with that status.
   */
  async lockUnit(
    manager: EntityManager,
    unitId: number,
  ): Promise<ProductionUnitView> {
    const head = await manager.getRepository(ProductionUnit).findOne({
      where: { id: unitId, isDeleted: false },
      select: { id: true, productionOrderId: true },
    });
    if (!head) throw new NotFoundException('Production cabinet not found');
    await lockProductionOrder(manager, head.productionOrderId);
    const rows: ProductionUnitView[] = await manager.query(
      `${SELECT_UNIT} WHERE u.id = $1 AND u.is_deleted = false FOR UPDATE OF u`,
      [unitId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Production cabinet not found');
    }
    return rows[0];
  }

  /**
   * The live (not cancelled) production order of a sales order `FOR UPDATE`, then all its
   * cabinets `FOR UPDATE` by ascending id. Empty when the order has no live production order.
   */
  async lockOrderUnits(
    manager: EntityManager,
    orderId: number,
  ): Promise<ProductionUnitView[]> {
    const heads: Array<{ id: number }> = await manager.query(
      `SELECT id FROM production_orders
        WHERE order_id = $1 AND is_deleted = false AND status <> $2
        ORDER BY id FOR UPDATE`,
      [orderId, ProductionOrderStatus.CANCELLED],
    );
    if (heads.length === 0) return [];
    return manager.query(
      `${SELECT_UNIT}
        WHERE u.production_order_id = ANY($1) AND u.is_deleted = false
        ORDER BY u.id FOR UPDATE OF u`,
      [heads.map((head) => head.id)],
    );
  }

  /** Every cabinet that matches, unpaged, by production order id then cabinet id. Takes no lock. */
  listUnits(
    manager: EntityManager,
    filter: ListUnitsFilter,
  ): Promise<ProductionUnitView[]> {
    const scope = filter.orderScope('po.order_id');
    const params = [...scope.params];
    const where = [`u.is_deleted = false`, `po.is_deleted = false`, scope.sql];
    if (filter.orderId !== undefined) {
      params.push(filter.orderId);
      where.push(`po.order_id = $${params.length}`);
    }
    if (filter.unitId !== undefined) {
      params.push(filter.unitId);
      where.push(`u.id = $${params.length}`);
    }
    if (filter.finishingDone !== undefined) {
      where.push(
        `${FINISHING_DONE} = ${filter.finishingDone ? 'TRUE' : 'FALSE'}`,
      );
    }
    return manager.query(
      `${SELECT_UNIT} WHERE ${where.map((part) => `(${part})`).join(' AND ')}
        ORDER BY po.id, u.id`,
      params,
    );
  }
}
