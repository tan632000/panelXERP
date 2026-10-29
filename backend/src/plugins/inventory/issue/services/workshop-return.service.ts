import { ConflictException, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';
import { isUniqueViolationOn } from '@shared/utils/db-error.util';

import { trimToNull } from '@plugins/inventory/_shared/utils/text.util';
import {
  RETURNABLE_ORDER_STATUSES,
  WORKSHOP_RETURN_CODE_INDEX,
  WORKSHOP_RETURN_CODE_PREFIX,
  WORKSHOP_RETURN_DOCUMENT_TYPE,
  WORKSHOP_RETURN_REQUEST_KEY_INDEX,
  WORKSHOP_RETURN_TABLE,
} from '@plugins/inventory/issue/constants/issue.constant';
import { OrderStockDocumentFilterDto } from '@plugins/inventory/issue/dto/stock-issue-filter.dto';
import { CreateWorkshopReturnDto } from '@plugins/inventory/issue/dto/stock-issue.dto';
import { OrderStockDocumentReader } from '@plugins/inventory/issue/services/order-stock-document.reader';
import {
  assertOrderStatus,
  assertPanelsOfOrder,
  insertOrderStockHeader,
  lockVisibleOrder,
  netIssuedAt,
  netIssuedOf,
  quantitiesOf,
  storedDocumentId,
} from '@plugins/inventory/issue/utils/order-stock-document.util';
import { ReservationService } from '@plugins/inventory/material/services/reservation.service';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { OrderStockDocumentDetail } from '@plugins/inventory/issue/services/order-stock-document.reader';
import type { EntityManager } from 'typeorm';

/** Cost of one unit: 4 dp half-up, like every average (D-06). */
const COST_DECIMALS = 4;

export interface WorkshopReturnPostResult {
  created: boolean;
  workshopReturn: OrderStockDocumentDetail;
}

interface Posted {
  id: number;
  orderIds: number[];
  itemIds: number[];
}

/**
 * What the workshop brings back from an open or cancelled order. Same opening as an issue —
 * order `FOR SHARE`, then the header with its request key before any check — then under the
 * balance locks: never more than the order still has out (409), at the order's net issued
 * average cost of the item, and the stock goes back to the order first while it is open and
 * still short (otherwise to the short orders by delivery date).
 */
@Injectable()
export class WorkshopReturnService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly posting: StockPostingService,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataScope: DataScopeService,
    private readonly reservations: ReservationService,
    private readonly shortageAlerts: ShortageAlertService,
    private readonly reader: OrderStockDocumentReader,
  ) {}

  findAll(query: OrderStockDocumentFilterDto, actor: AuthUserPayload) {
    return this.reader.findAll(WORKSHOP_RETURN_TABLE, query, actor);
  }

  findOne(id: number, actor: AuthUserPayload) {
    return this.reader.findOne(WORKSHOP_RETURN_TABLE, id, actor);
  }

  /** Posts a return numbered `NT_YYYY_NNNN`; request keys as for an issue (D-18). */
  async create(
    dto: CreateWorkshopReturnDto,
    actor: AuthUserPayload,
  ): Promise<WorkshopReturnPostResult> {
    const stored = await storedDocumentId(
      this.dataSource.manager,
      WORKSHOP_RETURN_TABLE,
      dto.requestKey,
    );
    if (stored) return this.replay(stored, actor);

    let posted: Posted;
    try {
      posted = await createWithDocumentCode(
        this.dataSource,
        {
          table: WORKSHOP_RETURN_TABLE,
          prefix: WORKSHOP_RETURN_CODE_PREFIX,
          codeUniqueIndex: WORKSHOP_RETURN_CODE_INDEX,
          exhaustedMessage:
            'Could not allocate a workshop return number; please try again.',
        },
        (manager, code) => this.post(manager, code, dto, actor),
      );
    } catch (error: unknown) {
      if (!isUniqueViolationOn(error, [WORKSHOP_RETURN_REQUEST_KEY_INDEX])) {
        throw error;
      }
      const twin = await storedDocumentId(
        this.dataSource.manager,
        WORKSHOP_RETURN_TABLE,
        dto.requestKey,
      );
      if (!twin) throw error;
      return this.replay(twin, actor);
    }

    await this.shortageAlerts.afterCommit(posted.orderIds, posted.itemIds);
    return {
      created: true,
      workshopReturn: await this.findOne(posted.id, actor),
    };
  }

  private async replay(
    id: number,
    actor: AuthUserPayload,
  ): Promise<WorkshopReturnPostResult> {
    return { created: false, workshopReturn: await this.findOne(id, actor) };
  }

  private async post(
    manager: EntityManager,
    code: string,
    dto: CreateWorkshopReturnDto,
    actor: AuthUserPayload,
  ): Promise<Posted> {
    const order = await lockVisibleOrder(
      manager,
      this.orders,
      this.dataScope,
      dto.orderId,
      actor,
    );
    // Straight after the order lock and before any check, as for an issue (D-18).
    const returnId = await insertOrderStockHeader(
      manager,
      WORKSHOP_RETURN_TABLE,
      {
        code,
        orderId: order.id,
        note: trimToNull(dto.note),
        requestKey: dto.requestKey ?? null,
        actorId: actor.userId,
      },
    );
    assertOrderStatus(
      order,
      RETURNABLE_ORDER_STATUSES,
      'only an open or cancelled order takes returns',
    );

    await assertPanelsOfOrder(manager, this.orders, order, dto.lines);

    const { quantities, perItem } = quantitiesOf(dto.lines);
    const itemIds = [...perItem.keys()].sort((a, b) => a - b);
    const stock = await this.posting.lockBalances(manager, itemIds);

    // Under the balance locks: a return of the same item that ran alongside has committed.
    const net = await netIssuedOf(manager, order.id, itemIds);
    const costOf = new Map<number, Decimal>();
    for (const itemId of itemIds) {
      const out = netIssuedAt(net, itemId);
      if ((perItem.get(itemId) as Decimal).greaterThan(out.quantity)) {
        throw new ConflictException(
          `${(stock.get(itemId) as { code: string }).code}: only ${out.quantity.toFixed()} of order ${order.code} is out at the workshop.`,
        );
      }
      costOf.set(
        itemId,
        out.value
          .dividedBy(out.quantity)
          .toDecimalPlaces(COST_DECIMALS, Decimal.ROUND_HALF_UP),
      );
    }

    const lineIds: number[] = [];
    for (const [index, line] of dto.lines.entries()) {
      const [row]: Array<{ id: number }> = await manager.query(
        `INSERT INTO stock_workshop_return_lines (return_id, item_id, order_line_id, quantity, note)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          returnId,
          line.itemId,
          line.orderLineId ?? null,
          quantities[index].toFixed(),
          trimToNull(line.note),
        ],
      );
      lineIds.push(Number(row.id));
    }
    const result = await this.posting.post(manager, {
      documentType: WORKSHOP_RETURN_DOCUMENT_TYPE,
      documentId: returnId,
      actorId: actor.userId,
      lines: dto.lines.map((line, index) => ({
        itemId: line.itemId,
        movementType: StockMovementType.WORKSHOP_RETURN,
        quantity: quantities[index].toFixed(),
        unitCost: (costOf.get(line.itemId) as Decimal).toFixed(),
        documentLineId: lineIds[index],
        orderId: order.id,
        orderLineId: line.orderLineId ?? null,
      })),
    });
    await manager.query(
      `UPDATE stock_workshop_return_lines l SET unit_cost = m.unit_cost, value = m.value
         FROM stock_movements m
        WHERE l.return_id = $1 AND m.document_type = $2 AND m.document_id = $1
          AND m.document_line_id = l.id`,
      [returnId, WORKSHOP_RETURN_DOCUMENT_TYPE],
    );
    // The order is preferred, but only an open order still short is a candidate at all.
    const allocated = await this.reservations.allocate(
      manager,
      result.itemIds,
      [order.id],
    );
    return {
      id: returnId,
      orderIds: [...new Set([order.id, ...allocated.orderIds])],
      itemIds: result.itemIds,
    };
  }
}
