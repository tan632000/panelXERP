import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

import { DataScopeService } from '@shared/services/data-scope.service';
import { isUniqueViolationOn } from '@shared/utils/db-error.util';

import { trimToNull } from '@plugins/inventory/_shared/utils/text.util';
import {
  ISSUABLE_ORDER_STATUSES,
  STOCK_ISSUE_CODE_INDEX,
  STOCK_ISSUE_CODE_PREFIX,
  STOCK_ISSUE_DOCUMENT_TYPE,
  STOCK_ISSUE_REQUEST_KEY_INDEX,
  STOCK_ISSUE_TABLE,
} from '@plugins/inventory/issue/constants/issue.constant';
import { OrderStockDocumentFilterDto } from '@plugins/inventory/issue/dto/stock-issue-filter.dto';
import { CreateStockIssueDto } from '@plugins/inventory/issue/dto/stock-issue.dto';
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
import { DEMAND_BEARING_STATUSES } from '@plugins/inventory/material/constants/material.constant';
import { ShortageAlertService } from '@plugins/inventory/material/services/shortage-alert.service';
import { StockMovementType } from '@plugins/inventory/stock/enums/stock-movement-type.enum';
import { StockPostingService } from '@plugins/inventory/stock/services/stock-posting.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';
import { OrderFollowerNotifier } from '@plugins/sales/_shared/services/order-follower-notifier';
import { createWithDocumentCode } from '@plugins/sales/_shared/utils/sales-document-code.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { OrderStockDocumentDetail } from '@plugins/inventory/issue/services/order-stock-document.reader';
import type { EntityManager } from 'typeorm';

/** An issue as the post answers it: `created` is false when the request key was seen before. */
export interface StockIssuePostResult {
  created: boolean;
  issue: OrderStockDocumentDetail;
}

interface Posted {
  id: number;
  code: string;
  orderIds: number[];
  itemIds: number[];
}

/**
 * Materials issued to an open order. A post runs in one transaction that takes the order
 * `FOR SHARE` first, inserts the issue header with its request key at once — before any check —
 * then locks the balance rows and only under them reads what the order already received, so
 * the over-BOM rule holds when two issues race. The posting takes the order's own reservation
 * first and refuses to dip into another order's (409).
 */
@Injectable()
export class StockIssueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly posting: StockPostingService,
    private readonly orders: OrderMaterialReadPort,
    private readonly dataScope: DataScopeService,
    private readonly shortageAlerts: ShortageAlertService,
    private readonly reader: OrderStockDocumentReader,
    private readonly followers: OrderFollowerNotifier,
  ) {}

  findAll(query: OrderStockDocumentFilterDto, actor: AuthUserPayload) {
    return this.reader.findAll(STOCK_ISSUE_TABLE, query, actor);
  }

  findOne(id: number, actor: AuthUserPayload) {
    return this.reader.findOne(STOCK_ISSUE_TABLE, id, actor);
  }

  /**
   * Posts an issue numbered `XK_YYYY_NNNN`. A request key already stored answers the first
   * issue and posts nothing; a twin that committed while this one waited is caught by the
   * request key index instead. Alerts go out after the commit, outside the retried work.
   */
  async create(
    dto: CreateStockIssueDto,
    actor: AuthUserPayload,
  ): Promise<StockIssuePostResult> {
    const stored = await storedDocumentId(
      this.dataSource.manager,
      STOCK_ISSUE_TABLE,
      dto.requestKey,
    );
    if (stored) return this.replay(stored, actor);

    let posted: Posted;
    try {
      posted = await createWithDocumentCode(
        this.dataSource,
        {
          table: STOCK_ISSUE_TABLE,
          prefix: STOCK_ISSUE_CODE_PREFIX,
          codeUniqueIndex: STOCK_ISSUE_CODE_INDEX,
          exhaustedMessage:
            'Could not allocate a stock issue number; please try again.',
        },
        (manager, code) => this.post(manager, code, dto, actor),
      );
    } catch (error: unknown) {
      if (!isUniqueViolationOn(error, [STOCK_ISSUE_REQUEST_KEY_INDEX])) {
        throw error;
      }
      const twin = await storedDocumentId(
        this.dataSource.manager,
        STOCK_ISSUE_TABLE,
        dto.requestKey,
      );
      if (!twin) throw error;
      return this.replay(twin, actor);
    }

    await this.shortageAlerts.afterCommit(posted.orderIds, posted.itemIds);
    // `orderIds` also lists orders whose reservations moved; the notice is for the issue's own.
    await this.followers.notify(dto.orderId, 'stock_issued', actor.userId, {
      extra: { issueCode: posted.code },
    });
    return { created: true, issue: await this.findOne(posted.id, actor) };
  }

  private async replay(
    id: number,
    actor: AuthUserPayload,
  ): Promise<StockIssuePostResult> {
    return { created: false, issue: await this.findOne(id, actor) };
  }

  private async post(
    manager: EntityManager,
    code: string,
    dto: CreateStockIssueDto,
    actor: AuthUserPayload,
  ): Promise<Posted> {
    const order = await lockVisibleOrder(
      manager,
      this.orders,
      this.dataScope,
      dto.orderId,
      actor,
    );
    // Straight after the order lock and before any check: a twin carrying the same request key
    // waits on the index here, then fails on it instead of on a check.
    const issueId = await insertOrderStockHeader(manager, STOCK_ISSUE_TABLE, {
      code,
      orderId: order.id,
      note: trimToNull(dto.note),
      requestKey: dto.requestKey ?? null,
      actorId: actor.userId,
    });
    assertOrderStatus(
      order,
      ISSUABLE_ORDER_STATUSES,
      'only an open order takes materials',
    );

    await assertPanelsOfOrder(manager, this.orders, order, dto.lines);

    const { quantities, perItem } = quantitiesOf(dto.lines);
    const itemIds = [...perItem.keys()].sort((a, b) => a - b);
    const stock = await this.posting.lockBalances(manager, itemIds);

    // Only now, under the balance locks: an issue of the same item that ran alongside has
    // committed, so its quantity counts towards the BOM.
    const demands = await this.orders.openDemand(
      manager,
      { orderId: order.id, itemIds },
      DEMAND_BEARING_STATUSES,
    );
    const demandOf = new Map(
      demands.map((demand) => [demand.itemId, new Decimal(demand.demand)]),
    );
    const net = await netIssuedOf(manager, order.id, itemIds);
    for (const itemId of itemIds) {
      const after = netIssuedAt(net, itemId).quantity.add(
        perItem.get(itemId) as Decimal,
      );
      if (!after.greaterThan(demandOf.get(itemId) ?? 0)) continue;
      const unexplained = dto.lines.some(
        (line) => line.itemId === itemId && !trimToNull(line.reason),
      );
      if (unexplained) {
        throw new BadRequestException(
          `${(stock.get(itemId) as { code: string }).code}: issuing more than the BOM of order ${order.code} needs a reason on every line of the item.`,
        );
      }
    }

    const lineIds: number[] = [];
    for (const [index, line] of dto.lines.entries()) {
      const [row]: Array<{ id: number }> = await manager.query(
        `INSERT INTO stock_issue_lines (issue_id, item_id, order_line_id, quantity, reason)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          issueId,
          line.itemId,
          line.orderLineId ?? null,
          quantities[index].toFixed(),
          trimToNull(line.reason),
        ],
      );
      lineIds.push(Number(row.id));
    }
    const result = await this.posting.post(manager, {
      documentType: STOCK_ISSUE_DOCUMENT_TYPE,
      documentId: issueId,
      actorId: actor.userId,
      lines: dto.lines.map((line, index) => ({
        itemId: line.itemId,
        movementType: StockMovementType.ISSUE,
        quantity: quantities[index].negated().toFixed(),
        documentLineId: lineIds[index],
        orderId: order.id,
        orderLineId: line.orderLineId ?? null,
        reason: trimToNull(line.reason),
      })),
    });
    await manager.query(
      `UPDATE stock_issue_lines l SET unit_cost = m.unit_cost, value = m.value
         FROM stock_movements m
        WHERE l.issue_id = $1 AND m.document_type = $2 AND m.document_id = $1
          AND m.document_line_id = l.id`,
      [issueId, STOCK_ISSUE_DOCUMENT_TYPE],
    );
    return {
      id: issueId,
      code,
      // The order itself is evaluated even when it held no reservation of the items.
      orderIds: [...new Set([order.id, ...result.changedOrderIds])],
      itemIds: result.itemIds,
    };
  }
}
